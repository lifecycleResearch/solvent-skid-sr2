# OpenShell: the sandbox that runs the build and talks to Google

The skid figure is static, but the things around it are not: the build can be
run inside a sandbox, the sandbox can reach Google's free tier and Colab, and
the whole thing is published to your tailnet so it does not need a box on AWS.

## What is in here

| File | What |
|---|---|
| `google.policy.yaml` | the sandbox's policy: Google, Colab, GitHub and the deployed figure API — and nothing else |
| `Dockerfile` | the sandbox image: Node 22 (the anatomy kit is Node built-ins), Python, curl, git, jq |
| `skid_colab.ipynb` | a Colab notebook that clones the repo, builds the figure and asks the plant questions |

## The gateway, on the tailnet instead of on AWS

The OpenShell gateway runs on this machine and is published to the tailnet by
Tailscale, so any device on the tailnet can drive the sandbox — no EC2 box, no
`nullclaw-aws`:

```bash
# once: publish the gateway to the tailnet (tailnet only, not the internet)
tailscale serve --bg --tcp=17670 tcp://127.0.0.1:17670

# from any tailnet machine:
openshell gateway add http://richards-macbook-air-1.tailbe58ee.ts.net:17670
openshell -g richards-macbook-air-1.tailbe58ee.ts.net sandbox list
openshell -g richards-macbook-air-1.tailbe58ee.ts.net sandbox exec skid -- sh -lc 'node --version'
```

The gateway itself listens on loopback only and runs with
`allow_unauthenticated_users`, because it sits behind Tailscale's own
authentication: only devices on your tailnet can reach the forwarded port.

## Start the gateway

```bash
# the binaries (no brew, no npm): release tarballs with the checksums verified
openshell-gateway generate-certs --output-dir ~/.local/openshell/tls
openshell-gateway --name openshell --config ~/.local/openshell/gateway.toml

# the gateway config needs three things:
#   [openshell] version = 2
#   [openshell.gateway.auth] allow_unauthenticated_users = true
#   [openshell.gateway.gateway_jwt] signing/public/kid paths + a gateway id
# the last one is what lets the docker driver mint launch-scoped sandbox
# credentials; without it, "docker sandboxes require launch-scoped gateway
# authentication"

openshell gateway add http://127.0.0.1:17670
```

## The sandbox

```bash
docker build -t skid-sandbox:latest openshell/
openshell sandbox create --name skid --policy openshell/google.policy.yaml --from skid-sandbox:latest
openshell sandbox exec skid -- sh -lc 'curl -s -o /dev/null -w "%{http_code}\n" https://colab.research.google.com/'
```

Inside it, the policy decides what is reachable:

| Host | Why |
|---|---|
| `generativelanguage.googleapis.com` | Gemini, the free tier |
| `colab.research.google.com`, `content-colab.googleapis.com` | the notebook backend |
| `drive.google.com`, `oauth2.googleapis.com`, `accounts.google.com` | Drive and sign-in |
| `github.com`, `api.github.com`, `objects.githubusercontent.com`, `codeload.github.com` | the repository |
| `solvent-skid-sr2.lifecyclerd.workers.dev` | the deployed figure and its API |

Anything else is refused by the sandbox's own network policy — `example.com`
answers `000`, not a page.

A policy change on a running sandbox needs the sandbox to be restarted before
the new hosts are reachable:

```bash
openshell policy update skid --add-endpoint "github.com:443:read-only:rest:enforce" --binary /usr/bin/git
openshell sandbox stop skid && openshell sandbox start skid
```

## The key: an OpenShell provider, not a file

Credentials are never written into the policy or the image. They live in an
OpenShell provider, and the gateway injects them into the sandbox only for the
endpoints above:

```bash
openshell provider create --name google --type google \
  --credential GEMINI_API_KEY=$GEMINI_API_KEY
openshell sandbox provider attach skid --provider google
```

`openshell provider list` and `openshell sandbox provider list skid` show what
is attached. If a provider profile is missing for your key type, create the
provider with `--from-existing` or `--credential KEY` (an environment variable
name) instead.

## From the sandbox to the plant

```bash
openshell sandbox exec skid -- sh -lc '
  cd /sandbox && git clone --depth 1 https://github.com/lifecycleResearch/solvent-skid-sr2
  cd solvent-skid-sr2
  node figures/skid/build.mjs && node figures/skid/build.mjs --light
  node scripts/lines.mjs figures/skid/skid-light.html
  curl -s "https://solvent-skid-sr2.lifecyclerd.workers.dev/api/describe?q=what+does+the+13X+bed+take"
'
```

That last line is the point of the whole arrangement: the sandbox can ask the
deployed plant what it is, over the same API the chatbot on the figure uses.
