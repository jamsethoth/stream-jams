param(
    [Parameter(Mandatory = $true)][string] $Snapshot
)

# Structural inspection only. Never decode undocumented PFNs or report eviction.
# XmlReader streams the large hex text; paths, keys and process names are omitted.
$ErrorActionPreference = 'Stop'
$reader = $null
try {
    $item = Get-Item -LiteralPath $Snapshot
    if ($item.PSIsContainer) { throw 'Expected snapshot file' }
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [System.Xml.XmlReader]::Create($item.FullName, $settings)
    $sections = [System.Collections.Generic.List[string]]::new()
    $fileAttributes = [System.Collections.Generic.HashSet[string]]::new()
    $files = 0; $emptyFiles = 0; $fileChildren = 0; $processes = 0
    $pfnCharacters = [long]0
    $rootMatches = $false; $section = ''; $seenRoot = $false
    $buffer = [char[]]::new(65536)
    while ($reader.Read()) {
        if ($reader.NodeType -eq [System.Xml.XmlNodeType]::Element) {
            if ($reader.Depth -eq 0) {
                $seenRoot = $true
                $rootMatches = $reader.Name -eq 'root' -and $reader.GetAttribute('Application') -eq 'RamMap' -and $reader.GetAttribute('Version') -eq '1.0' -and $reader.GetAttribute('Architecture') -eq 'amd64'
            } elseif ($reader.Depth -eq 1) {
                $section = $reader.Name
                $sections.Add($section)
            } elseif ($reader.Depth -eq 2 -and $section -eq 'FileList' -and $reader.Name -eq 'File') {
                $files++
                if ($reader.IsEmptyElement) { $emptyFiles++ }
                while ($reader.MoveToNextAttribute()) { [void]$fileAttributes.Add($reader.Name) }
                [void]$reader.MoveToElement()
            } elseif ($reader.Depth -gt 2 -and $section -eq 'FileList') {
                $fileChildren++
            } elseif ($reader.Depth -eq 2 -and $section -eq 'ProcessList' -and $reader.Name -eq 'Process') {
                $processes++
            }
        } elseif ($reader.NodeType -eq [System.Xml.XmlNodeType]::Text -and $section -eq 'PfnDatabase') {
            while (($count = $reader.ReadValueChunk($buffer, 0, $buffer.Length)) -gt 0) { $pfnCharacters += $count }
        }
    }
    if (-not $seenRoot) { throw 'Missing XML root' }
    [ordered]@{
        status = 'inconclusive'
        purpose = 'XML structure only; not an eviction observer'
        reason = 'No validated file-key/PFN-record join, page-state layout, or completeness contract'
        snapshotBytes = $item.Length
        recognizedRoot = $rootMatches
        sections = @($sections.ToArray())
        processEntries = $processes
        fileEntries = $files
        selfClosingFileEntries = $emptyFiles
        fileAttributeNames = @($fileAttributes | Sort-Object)
        fileChildElements = $fileChildren
        pfnDatabaseTextCharacters = $pfnCharacters
    } | ConvertTo-Json -Depth 3
} catch {
    # Do not expose XML/file-system exception text containing unrelated paths.
    @{ status = 'inconclusive'; reason = 'Snapshot unavailable, malformed, or prohibited XML'; purpose = 'XML structure only; not an eviction observer' } | ConvertTo-Json
    exit 1
} finally {
    if ($null -ne $reader) { $reader.Dispose() }
}
