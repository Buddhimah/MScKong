FROM golang:1.24 as builder
WORKDIR /workspace
# Copy the Go Modules manifests
COPY go.mod go.mod
COPY go.sum go.sum
# cache deps before building and copying source so that we don't need to re-download as much
# and so that source changes don't invalidate our downloaded layer
RUN go mod download

# Copy the go source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GO111MODULE=on go build -a -o uuid main.go

# Use distroless as minimal base image to package the manager binary
# Refer to https://github.com/GoogleContainerTools/distroless for more details
FROM alpine:latest

RUN apk update
RUN apk add --no-cache bash curl jq
WORKDIR /
COPY --from=builder /workspace/uuid .
# Expose port 8080
EXPOSE 8080
ENTRYPOINT ["/uuid"]