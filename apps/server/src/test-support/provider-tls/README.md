# Public TLS test fixtures

Every private key here is deliberately public test material. These certificates
must never protect production data or be installed in the machine trust store.
Tests trust `ca.pem` only in a child process using `NODE_EXTRA_CA_CERTS`.

Generated with Git for Windows OpenSSL: `req -x509 -newkey rsa:2048 -nodes`
creates the public test CA; `req -new -newkey rsa:2048 -nodes` creates each leaf.
`openssl ca -batch -startdate 20200101000000Z -enddate 20400101000000Z`
signs trusted and wrong-SAN leaves. The expired leaf ends `20200102000000Z`.
Each leaf uses `extendedKeyUsage=serverAuth`. Trusted SANs are
`IP:127.0.0.1,IP:::1,DNS:localhost`; wrong-SAN uses `DNS:wrong.test`.
The CA certificate uses a 7300-day lifetime from generation.

Exact regeneration recipe (run in an empty temporary directory with OpenSSL):

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca-key.pem -out ca.pem -subj '/CN=Stream Jams Public Test CA' -days 7300
touch index.txt
printf '01\n' > serial
cat > ca.cnf <<'EOF'
[ca]
default_ca=local
[local]
database=index.txt
serial=serial
new_certs_dir=.
certificate=ca.pem
private_key=ca-key.pem
default_md=sha256
policy=policy
[policy]
commonName=supplied
EOF
for name in trusted wrong-san expired; do
  openssl req -new -newkey rsa:2048 -nodes -keyout "$name-key.pem" -out "$name.csr" -subj "/CN=$name"
  san='IP:127.0.0.1,IP:::1,DNS:localhost'
  end='20400101000000Z'
  [ "$name" != wrong-san ] || san='DNS:wrong.test'
  [ "$name" != expired ] || end='20200102000000Z'
  printf 'subjectAltName=%s\nextendedKeyUsage=serverAuth\n' "$san" > "$name.ext"
  openssl ca -batch -config ca.cnf -in "$name.csr" -out "$name.pem" -startdate 20200101000000Z -enddate "$end" -extfile "$name.ext" -notext
done
```

Copy only `ca.pem`, `ca-key.pem`, and the three named leaf certificate/key
pairs into this fixture directory. Tests assert the intended validity range
and SAN before invoking production clients, so expired fixtures produce a
fixture diagnosis rather than a misleading product failure.
