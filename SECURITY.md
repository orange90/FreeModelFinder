# Security Policy

## Supported versions

Only the latest published version of FreeModelFinder receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository. Include reproduction steps, affected versions and the expected impact when possible.

## Local security boundary

FreeModelFinder listens only on the loopback interface. Provider credentials and the optional Gateway Key are encrypted before being written to the local configuration directory. The encryption master key is stored separately with restrictive file permissions, but this is not an operating-system keychain: other processes running as the same operating-system user remain inside the trust boundary.
