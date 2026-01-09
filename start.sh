#!/bin/sh

cd scripts
node cli.js
cd ..

for file in scripts/results/*; do
    filename=$(basename "$file")
    if [ "$filename" != ".gitkeep" ]; then
        cp "$file" "web/data/"
    fi
done

cd web
java JExpress.java
