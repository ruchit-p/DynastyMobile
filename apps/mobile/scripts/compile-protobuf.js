#!/usr/bin/env node

const pbjs = require('protobufjs-cli/pbjs');
const fs = require('fs');
const path = require('path');

const protoPath = path.join(__dirname, '../src/lib/signal-protocol/proto/signal.proto');
const outputPath = path.join(__dirname, '../src/lib/signal-protocol/proto/signal.json');

console.log('Compiling Signal Protocol protobuf definitions...');

// Compile proto to JSON
pbjs.main([
  '--target', 'json',
  '--out', outputPath,
  protoPath
], (err) => {
  if (err) {
    console.error('Failed to compile protobuf:', err);
    process.exit(1);
  }
  
  console.log('✅ Protobuf compiled successfully to:', outputPath);
  
  // Also generate TypeScript definitions
  const tsOutputPath = path.join(__dirname, '../src/lib/signal-protocol/proto/signal.d.ts');
  
  pbjs.main([
    '--target', 'static-module',
    '--wrap', 'es6',
    '--out', tsOutputPath,
    protoPath
  ], (err) => {
    if (err) {
      console.error('Failed to generate TypeScript definitions:', err);
      process.exit(1);
    }
    
    console.log('✅ TypeScript definitions generated successfully to:', tsOutputPath);
  });
});