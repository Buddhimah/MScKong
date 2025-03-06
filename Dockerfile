# syntax=docker/dockerfile:1

# build stage for building the program
FROM golang:1.24-alpine AS build
WORKDIR /src

# Download dependencies
COPY go.mod go.sum .
RUN go mod download

# Compile the program
COPY . .
RUN go build -o /buildme .

# final runtime stage
FROM alpine AS final

# Copy the binary from the build stage
COPY --from=build /buildme /

# Start the program
ENTRYPOINT ["/buildme"]