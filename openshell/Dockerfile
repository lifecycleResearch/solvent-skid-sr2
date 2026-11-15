# The sandbox image for the solvent-skid figure: Node (the anatomy kit is
# Node built-ins), Python and curl for the Google free tier, and git to pull
# the repo. Built on the host, then handed to OpenShell as --from.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git jq python3 python3-requests \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /sandbox
ENV HOME=/home/ubuntu
CMD ["/bin/bash"]
