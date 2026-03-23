#!/bin/bash
# 为 Electron 应用生成自签名证书 (macOS)
# 在终端中运行此脚本

set -e

CERT_NAME="GrapWork"
CERT_SUBJECT="/CN=GrapWork/O=MirrorGrap/C=CN"
CERT_PATH="build/certificates"
P12_FILE="$CERT_PATH/grapework.pfx"
PEM_FILE="$CERT_PATH/grapework.pem"
KEY_FILE="$CERT_PATH/grapework.key"
PASSWORD="grapeWork2026"
DAYS=365

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}  GrapWork macOS 自签名证书生成器${NC}"
echo -e "${CYAN}=========================================${NC}"

# 切换到脚本所在目录的父目录（frontend）
cd "$(dirname "$0")/.."

# 创建证书目录
if [ ! -d "$CERT_PATH" ]; then
    mkdir -p "$CERT_PATH"
    echo -e "${GREEN}已创建证书目录：$CERT_PATH${NC}"
fi

# 检查证书是否已存在
if [ -f "$P12_FILE" ]; then
    echo -e "${YELLOW}找到已存在的证书文件：$P12_FILE${NC}"
    read -p "是否重新生成？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}使用现有证书${NC}"
        exit 0
    fi
    # 备份旧证书
    mv "$P12_FILE" "$P12_FILE.backup"
    [ -f "$PEM_FILE" ] && mv "$PEM_FILE" "$PEM_FILE.backup"
    [ -f "$KEY_FILE" ] && mv "$KEY_FILE" "$KEY_FILE.backup"
fi

echo -e "${CYAN}正在创建新的自签名证书...${NC}"

# 生成私钥和证书
openssl req -x509 \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$PEM_FILE" \
    -days $DAYS \
    -nodes \
    -subj "$CERT_SUBJECT" \
    -addext "extendedKeyUsage=codeSigning" \
    -addext "basicConstraints=critical,CA:FALSE"

echo -e "${GREEN}证书和私钥已生成${NC}"

# 转换为 P12 格式
# 注意：macOS Monterey+ 需要 -legacy 选项
if [[ $(sw_vers -productVersion | cut -d. -f1) -ge 12 ]]; then
    openssl pkcs12 -export -legacy \
        -out "$P12_FILE" \
        -inkey "$KEY_FILE" \
        -in "$PEM_FILE" \
        -password pass:"$PASSWORD"
else
    openssl pkcs12 -export \
        -out "$P12_FILE" \
        -inkey "$KEY_FILE" \
        -in "$PEM_FILE" \
        -password pass:"$PASSWORD"
fi

echo -e "${GREEN}已导出 P12 文件：$P12_FILE${NC}"

# 将证书导入到钥匙串（可选，用于本地签名）
echo -e "${CYAN}是否将证书导入到登录钥匙串？(y/N):${NC}"
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 使用 PEM 文件导入证书和私钥（更可靠）
    # 先导入私钥
    security import "$KEY_FILE" -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign 2>/dev/null || true
    # 再导入证书
    security import "$PEM_FILE" -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign
    echo -e "${GREEN}证书已导入到登录钥匙串${NC}"

    # 设置信任设置（避免签名警告）
    echo -e "${CYAN}正在设置证书信任级别...${NC}"
    security add-trusted-cert -r trustAsRoot -k ~/Library/Keychains/login.keychain-db "$PEM_FILE" 2>/dev/null || true
    echo -e "${GREEN}证书信任设置完成${NC}"
fi

# 清理敏感文件（保留 P12）
echo -e "${CYAN}是否删除中间文件（私钥和 PEM）？(Y/n):${NC}"
read -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    rm -f "$KEY_FILE" "$PEM_FILE"
    echo -e "${GREEN}中间文件已删除${NC}"
else
    echo -e "${YELLOW}保留中间文件：$KEY_FILE, $PEM_FILE${NC}"
fi

# 显示证书信息
echo ""
echo -e "${CYAN}=========================================${NC}"
echo -e "${GREEN}证书生成完成！${NC}"
echo -e "${CYAN}=========================================${NC}"
echo -e "P12 文件：${CYAN}$P12_FILE${NC}"
echo -e "证书密码：${CYAN}$PASSWORD${NC}"
echo -e "有效期：${CYAN}$DAYS 天${NC}"
echo -e "${CYAN}=========================================${NC}"
echo ""
echo -e "${YELLOW}使用此证书构建 macOS 应用：${NC}"
echo -e "  ${CYAN}npm run electron:build:mac${NC}"
echo ""
echo -e "${YELLOW}注意：${NC}"
echo -e "  - 自签名证书签名的应用在其他 Mac 上运行时会有警告"
echo -e "  - 生产环境建议使用 Apple Developer Program 证书 (\$99/年)"
echo ""

# 显示证书详情
echo -e "${CYAN}证书详情：${NC}"
openssl pkcs12 -in "$P12_FILE" -passin pass:"$PASSWORD" -nokeys 2>/dev/null | openssl x509 -noout -subject -dates -fingerprint 2>/dev/null || true
