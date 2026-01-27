#!/bin/sh

# Vérifie si le cache existe déjà
if [ ! -f scripts/results/.cache-done ]; then
    echo "Running preprocessing..."
    cd scripts
    node cli.js
    touch results/.cache-done
    cd ..
else
    echo "Using cached preprocessing results"
fi

# Ensure web/data/roads directory exists
mkdir -p web/data/graphs

# Copy files directly in scripts/results to web/data/
for file in scripts/results/*; do
    filename=$(basename "$file")
    if [ -f "$file" ] && [ "$filename" != ".gitkeep" ] && [ "$filename" != ".cache-done" ]; then
        cp "$file" "web/data/"
    fi
done

# Copy files from scripts/results/roads to web/data/roads
for file in scripts/results/graphs/*; do
    filename=$(basename "$file")
    if [ -f "$file" ]; then
        cp "$file" "web/data/graphs/"
    fi
done

cd web
java JExpress.java
