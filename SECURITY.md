# Security Policy

Unship is local preview tooling. It should not introduce production runtime dependencies or remote services by default.

## Reporting A Vulnerability

Please report vulnerabilities through GitHub Security Advisories for this repository once the public repository exists.

If advisories are unavailable, open a minimal issue that says you need a private security contact. Do not include exploit details in a public issue.

## Scope

Security-sensitive areas include:

- generated picker scripts and dev-only mounts;
- source cleanup checks;
- CLI file writes;
- installed agent instructions;
- package publish contents.

## Expectations

- Picker setup must remain dev-only.
- `check` and `doctor` must remain read-only.
- Cleanup is performed by the agent editing source, not by a destructive lifecycle command.
- New runtime dependencies need a clear security and maintenance reason.
