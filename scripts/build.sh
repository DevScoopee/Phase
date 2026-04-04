#!/bin/bash

# PHASE Protocol - Build Script
# Compila y optimiza ambos contratos Soroban

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   PHASE Protocol - Build & Deploy Preparation Script      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check dependencies
echo "${CYAN}Verificando dependencias...${NC}"

if ! command -v cargo &> /dev/null; then
    echo "${RED}Error: Rust/Cargo no encontrado${NC}"
    echo "Instala Rust desde: https://rustup.rs"
    exit 1
fi

if ! command -v stellar &> /dev/null; then
    echo "${RED}Error: Stellar CLI no encontrado${NC}"
    echo "Instala con: cargo install --locked stellar-cli"
    exit 1
fi

echo "${GREEN}✓${NC} Rust/Cargo encontrado"
echo "${GREEN}✓${NC} Stellar CLI encontrado"

# Check wasm32 target
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
    echo "${YELLOW}Instalando target wasm32-unknown-unknown...${NC}"
    rustup target add wasm32-unknown-unknown
fi
echo "${GREEN}✓${NC} Target wasm32-unknown-unknown disponible"

echo ""
echo "${CYAN}Compilando Mock Token...${NC}"
cd ../contracts/mock-token
cargo build --target wasm32-unknown-unknown --release

if [ ! -f "target/wasm32-unknown-unknown/release/mock_token.wasm" ]; then
    echo "${RED}Error: No se pudo compilar el Mock Token${NC}"
    exit 1
fi
echo "${GREEN}✓${NC} Mock Token compilado"

echo ""
echo "${CYAN}Optimizando Mock Token...${NC}"
stellar contract optimize \
    --wasm target/wasm32-unknown-unknown/release/mock_token.wasm \
    --wasm-out target/wasm32-unknown-unknown/release/mock_token.optimized.wasm

if [ ! -f "target/wasm32-unknown-unknown/release/mock_token.optimized.wasm" ]; then
    echo "${YELLOW}⚠ Optimización falló, usando versión sin optimizar${NC}"
    cp target/wasm32-unknown-unknown/release/mock_token.wasm \
       target/wasm32-unknown-unknown/release/mock_token.optimized.wasm
fi
echo "${GREEN}✓${NC} Mock Token optimizado"

echo ""
echo "${CYAN}Compilando Phase Protocol...${NC}"
cd ../phase-protocol
cargo build --target wasm32-unknown-unknown --release

if [ ! -f "target/wasm32-unknown-unknown/release/phase_protocol.wasm" ]; then
    echo "${RED}Error: No se pudo compilar Phase Protocol${NC}"
    exit 1
fi
echo "${GREEN}✓${NC} Phase Protocol compilado"

echo ""
echo "${CYAN}Optimizando Phase Protocol...${NC}"
stellar contract optimize \
    --wasm target/wasm32-unknown-unknown/release/phase_protocol.wasm \
    --wasm-out target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm

if [ ! -f "target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm" ]; then
    echo "${YELLOW}⚠ Optimización falló, usando versión sin optimizar${NC}"
    cp target/wasm32-unknown-unknown/release/phase_protocol.wasm \
       target/wasm32-unknown-unknown/release/phase_protocol.optimized.wasm
fi
echo "${GREEN}✓${NC} Phase Protocol optimizado"

echo ""
echo "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo "${GREEN}║             ¡BUILD COMPLETADO EXITOSAMENTE!               ║${NC}"
echo "${GREEN}╠═══════════════════════════════════════════════════════════╣${NC}"
echo "║  Archivos generados:                                      ║"
echo "║    contracts/mock-token/target/wasm32-unknown-unknown/    ║"
echo "║      └── release/mock_token.optimized.wasm                ║"
echo "║                                                           ║"
echo "║    contracts/phase-protocol/target/wasm32-unknown-unknown/║"
echo "║      └── release/phase_protocol.optimized.wasm            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "${CYAN}Próximo paso: Desplegar a Testnet${NC}"
echo "  cd scripts/"
echo "  npm install"
echo "  npm run deploy:token"
echo ""