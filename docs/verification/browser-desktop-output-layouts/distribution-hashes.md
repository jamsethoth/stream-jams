# Distributed benchmark hash correction

S11 measurements ran against promoted Windows working controller bytes with CRLF (SHA256 `869204716D1885B2BAD80827D47A3F7F1CAA2584E5227A4010969B0704338881`). Commit `418b42f7` applied repository `* text=auto eol=lf`, yielding canonical distributed controller SHA256 `4C6D31A9314C7E081588790E6894F9C401787BCA24C058015B1D0936A6DFE39E`. The adapter now pins those LF bytes; workload, sampling and runtime behavior are unchanged.

[Provenance](provenance.json) distinguishes executed/captured working hashes from distributed LF hashes. Historical comparable/compact `adapter-manifest.json` input/adapted-controller hashes remain unchanged because they describe the actual measured run. Compiled manifests retain hashes of actual built artifacts; their distributed text may have LF while the captured text had CRLF. All baseline files remain untouched, including byte-exact fixture/metrics and historical original-controller hash.

Fresh-checkout-equivalent verification exercises the canonical LF script's strict hashes, matched environment and production pure fixture upgraders for comparable/compact modes, plus rejection of changed controller bytes. It starts no runtime/browser and writes no measurement directory. No measurements, build or native gates are repeated for this byte-distribution correction.
