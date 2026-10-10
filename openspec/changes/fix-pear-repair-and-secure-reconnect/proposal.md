# Proposal: Fix Pear Re-Pair Saving And Secure-Connection Reconnect Loops

## Why

On 2026-10-10 the maintainer re-paired an existing Pear Desktop source on Windows. After a passing connection test the page said "Save to use this source", but the only button that saves while re-pairing was labelled "Replace authorization", so the new authorization was never saved. Live Music then stayed at "reconnecting" indefinitely.

The live source kept using its saved address and certificate. Since PR #156 (trust self-signed Pear certificates) pairing follows Pear to HTTPS on the same port and pins an accepted certificate, so a source saved over plain HTTP, or pinned to a certificate Pear has since replaced, can never connect again. The runtime treated those failures as transient and retried forever without telling the user to re-pair.

## What Changes

- Re-pairing labels its save action "Save new authorization", and the passing-test message names that action.
- The Pear runtime stops retrying and reports `auth-required` (re-pair) when Pear presents a certificate the saved source does not trust, or when a source saved with an HTTP address finds Pear serving HTTPS on that port. The HTTPS check is a credential-free TLS handshake that reads only the certificate, the same probe pairing uses.
- The management auth-required message says the authorization, address or certificate changed and how to recover.
- Pear video IDs that start with `-` or `_`, as YouTube IDs can, become track IDs with a `yt:` prefix; previously such a track failed the shared music identity pattern and forced a reconnect loop while it played. The mapping stays in the server adapter so the overlay bundle, which has no gzip headroom, is unchanged.

## Out Of Scope

Automatically rewriting a saved address to HTTPS or trusting a new certificate without the user's review. TLS verification stays enabled; the user re-pairs and reviews the certificate as before.

## Impact

- `apps/server/src/modules/music/pear-music-source.ts`, `pear-config.ts` and tests.
- `apps/server/src/modules/music/pear-normalization.ts` (track ID mapping) and tests.
- `apps/web/src/management/music/MusicSourcesPage.tsx`, its story and tests.
- `music-source-providers` spec: secure-connection changes request explicit re-pairing.
