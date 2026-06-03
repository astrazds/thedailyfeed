#!/bin/bash

# Docker Build & Test Script for The Daily Feed
# This script validates and builds the Docker image

set -e

echo "🐳 The Daily Feed - Docker Build Script"
echo "========================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "   Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Error: Docker daemon is not running"
    echo "   Please start Docker daemon"
    exit 1
fi

echo "✅ Docker is installed and running"
echo ""

# Build the image
echo "📦 Building Docker image..."
docker build -t thedailyfeed:latest .

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Docker image built successfully!"
    echo ""
    
    # Show image details
    echo "📊 Image Details:"
    docker images thedailyfeed:latest
    echo ""
    
    # Ask if user wants to test
    read -p "🧪 Would you like to test the container? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Starting test container on port 3000..."
        
        # Stop and remove existing test container if it exists
        docker stop thedailyfeed-test 2>/dev/null || true
        docker rm thedailyfeed-test 2>/dev/null || true
        
        # Run container
        docker run -d \
            --name thedailyfeed-test \
            -p 3000:3000 \
            thedailyfeed:latest
        
        echo ""
        echo "✅ Container started!"
        echo ""
        echo "📍 Access the app at: http://localhost:3000"
        echo ""
        echo "Useful commands:"
        echo "  View logs:    docker logs -f thedailyfeed-test"
        echo "  Stop:         docker stop thedailyfeed-test"
        echo "  Remove:       docker rm thedailyfeed-test"
        echo ""
        
        # Wait a moment and check health
        sleep 5
        
        echo "🏥 Health Check:"
        if curl -s http://localhost:3000 > /dev/null; then
            echo "✅ Container is responding!"
        else
            echo "⚠️  Container might still be starting..."
            echo "   Check logs: docker logs thedailyfeed-test"
        fi
    fi
else
    echo ""
    echo "❌ Build failed! Check the errors above."
    exit 1
fi

echo ""
echo "🎉 Done!"
