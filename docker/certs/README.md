# Extra trusted certificates (optional)

Leave this folder empty unless the build or the app can't make HTTPS
connections, with errors like:

    UNABLE_TO_VERIFY_LEAF_SIGNATURE
    unable to verify the first certificate
    SELF_SIGNED_CERT_IN_CHAIN

That happens on networks where a company firewall, proxy or antivirus program
inspects HTTPS traffic and re-signs it with its own certificate. Computers on
that network trust the certificate, but the Docker image doesn't.

Fix: put that root certificate here as a PEM file ending in `.crt`, then rebuild
(`docker compose up -d --build`). It is added to the image's trusted
certificates, for both the build (npm) and the running app (DHL tracking).

- Ask IT for "the root CA certificate used for TLS inspection", or export it
  from Windows: `certmgr.msc` → Trusted Root Certification Authorities →
  Certificates → the company/antivirus certificate → All Tasks → Export →
  "Base-64 encoded X.509 (.CER)", and rename the file to end in `.crt`.
- `*.crt` files in this folder are ignored by git, so a certificate from one
  network isn't copied to every server.
