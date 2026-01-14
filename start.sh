#!/bin/sh

cd scripts
node cli.js
cd ..

# Ensure web/data/roads directory exists
mkdir -p web/data/roads

# Copy files directly in scripts/results to web/data/
for file in scripts/results/*; do
    filename=$(basename "$file")
    if [ -f "$file" ] && [ "$filename" != ".gitkeep" ]; then # Check if it's a file
        cp "$file" "web/data/"
    fi
done

# Copy files from scripts/results/roads to web/data/roads
for file in scripts/results/roads/*; do
    filename=$(basename "$file")
    if [ -f "$file" ]; then # Check if it's a file
        cp "$file" "web/data/roads/"
    fi
done

cd web
java JExpress.java
