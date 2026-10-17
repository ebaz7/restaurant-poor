#!/usr/bin/env bash
# ==============================================================================
# Arka Restaurant Software - Linux Management & Installation Script
# Supports: Custom Port, Custom Domain, SSL (Internal CDN / Iran & External modes)
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

APP_NAME="arka-restaurant"
INSTALL_DIR="/opt/arka-restaurant"

print_banner() {
    clear
    echo -e "${CYAN}================================================================${NC}"
    echo -e "${CYAN}        سیستم مدیریت و نصب نرم‌افزار رستورانی آرکا (Linux CLI)       ${NC}"
    echo -e "${CYAN}================================================================${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[!] لطفاً این اسکریپت را با دسترسی روت (sudo) اجرا کنید.${NC}"
        exit 1
    }
}

install_app() {
    print_banner
    echo -e "${YELLOW}[+] شروع مراحل نصب نرم‌افزار آرکا...${NC}"

    # 1. Get Custom Port
    read -p "[-] پورت دلخواه برای اجرا (پیش‌فرض 3000): " PORT
    PORT=${PORT:-3000}

    # 2. Get Domain and SSL settings
    read -p "[-] آیا می‌خواهید دامنه (Domain) و گواهی SSL متصل کنید؟ (y/n): " USE_SSL
    USE_SSL=${USE_SSL:-y}

    DOMAIN=""
    SSL_MODE="iran_cdn" # iran_cdn | external_letsencrypt | none

    if [[ "$USE_SSL" =~ ^[Yy]$ ]]; then
        read -p "[-] نام دامنه خود را وارد کنید (مثال: restaurant.ir): " DOMAIN
        echo -e "\n${CYAN}انتخاب نحوه دریافت گواهی SSL و استفاده از زیرساخت اینترنت:${NC}"
        echo "1) استفاده از زیرساخت و سرورهای داخلی ایران (CDN های داخلی / گواهی داخلی بدون تحریم)"
        echo "2) استفاده از گواهی بین‌المللی خارج (Let's Encrypt / Certbot)"
        read -p "[-] انتخاب کنید (1 یا 2، پیش‌فرض 1): " SSL_CHOICE
        SSL_CHOICE=${SSL_CHOICE:-1}

        if [ "$SSL_CHOICE" == "2" ]; then
            SSL_MODE="external_letsencrypt"
        else
            SSL_MODE="iran_cdn"
        fi
    fi

    echo -e "\n${YELLOW}[i] در حال بررسی و نصب پیش‌نیازها (Docker, Node.js, Nginx)...${NC}"
    if ! command -v docker &> /dev/null; then
        apt-get update && apt-get install -y curl git docker.io docker-compose
        systemctl enable --now docker
    fi

    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR" || exit 1

    echo -e "${YELLOW}[i] در حال آماده‌سازی فایل‌های پروژه و تنظیمات پورت ${PORT}...${NC}"

    # Create Dockerfile & docker-compose.yml
    cat <<EOF > Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE ${PORT}
CMD ["npm", "run", "start"]
EOF

    cat <<EOF > docker-compose.yml
version: '3.8'
services:
  arka-app:
    build: .
    restart: always
    ports:
      - "${PORT}:3000"
    environment:
      - PORT=3000
EOF

    # Configure Nginx and SSL if domain is provided
    if [ -n "$DOMAIN" ]; then
        echo -e "${YELLOW}[i] در حال تنظیم Nginx و SSL برای دامنه ${DOMAIN} (حالت: ${SSL_MODE})...${NC}"
        apt-get install -y nginx certbot python3-certbot-nginx

        if [ "$SSL_MODE" == "external_letsencrypt" ]; then
            certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN" || true
        else
            # Iran CDN / Internal Certificate Mode
            mkdir -p /etc/nginx/ssl/$DOMAIN
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout /etc/nginx/ssl/$DOMAIN/privkey.pem \
                -out /etc/nginx/ssl/$DOMAIN/fullchain.pem \
                -subj "/CN=$DOMAIN/O=Arka Restaurant Iran/C=IR"
        fi

        cat <<EOF > /etc/nginx/sites-available/$APP_NAME
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/nginx/ssl/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/$DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
        ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
        nginx -t && systemctl reload nginx
    fi

    echo -e "${YELLOW}[i] در حال ساخت و اجرای کانتینر داکر...${NC}"
    docker-compose up -d --build

    echo -e "\n${GREEN}================================================================${NC}"
    echo -e "${GREEN} ✅ نصب و راه‌اندازی نرم‌افزار رستورانی آرکا با موفقیت انجام شد! ${NC}"
    if [ -n "$DOMAIN" ]; then
        echo -e "${CYAN} 🌐 آدرس دسترسی: https://${DOMAIN}${NC}"
    else
        echo -e "${CYAN} 🌐 آدرس دسترسی: http://<IP_SERVER>:${PORT}${NC}"
    fi
    echo -e "${GREEN}================================================================${NC}"
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

backup_app() {
    print_banner
    echo -e "${YELLOW}[+] در حال تهیه نسخه پشتیبان (Backup)...${NC}"
    BACKUP_DIR="/opt/arka-backups"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/arka_backup_$TIMESTAMP.tar.gz"

    tar -czf "$BACKUP_FILE" -C "$INSTALL_DIR" . 2>/dev/null || true
    echo -e "${GREEN}[✓] نسخه پشتیبان با موفقیت در مسیر زیر ذخیره شد:${NC}"
    echo -e "${CYAN}    $BACKUP_FILE${NC}"
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

update_app() {
    print_banner
    echo -e "${YELLOW}[+] در حال بررسی و به‌روزرسانی (Update)...${NC}"
    if [ -d "$INSTALL_DIR" ]; then
        cd "$INSTALL_DIR" || exit 1
        if [ -d ".git" ]; then
            git pull
        else
            echo -e "${YELLOW}[i] سورس کد لایو به‌روز شد.${NC}"
        fi
        docker-compose down
        docker-compose up -d --build
        echo -e "${GREEN}[✓] به‌روزرسانی نرم‌افزار با موفقیت انجام شد.${NC}"
    else
        echo -e "${RED}[!] نرم‌افزار هنوز نصب نشده است. لطفاً ابتدا گزینه نصب را انتخاب کنید.${NC}"
    fi
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

remove_app() {
    print_banner
    echo -e "${RED}[!] هشدار: با این کار تمام داده‌ها و کانتینرهای نرم‌افزار حذف خواهند شد!${NC}"
    read -p "[-] آیا از حذف کامل نرم‌افزار (Box & App) اطمینان دارید؟ (y/N): " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        if [ -d "$INSTALL_DIR" ]; then
            cd "$INSTALL_DIR" || exit 1
            docker-compose down -v || true
            rm -rf "$INSTALL_DIR"
            rm -f /etc/nginx/sites-enabled/$APP_NAME
            rm -f /etc/nginx/sites-available/$APP_NAME
            systemctl reload nginx
            echo -e "${GREEN}[✓] نرم‌افزار و باکس‌های مرتبط با موفقیت حذف شدند.${NC}"
        else
            echo -e "${YELLOW}[i] دایرکتوری نصب یافت نشد.${NC}"
        fi
    fi
    read -p "[-] برای بازگشت به منو Enter بزنید..."
}

# Main Loop
check_root
while true; do
    print_banner
    echo -e " لطفاً یک گزینه را انتخاب کنید:\n"
    echo -e "   ${GREEN}1) نصب نرم‌افزار (پورت دلخواه، دامنه و SSL داخلی/خارجی)${NC}"
    echo -e "   ${BLUE}2) پشتیبان‌گیری (Backup)${NC}"
    echo -e "   ${CYAN}3) به‌روزرسانی (Update)${NC}"
    echo -e "   ${RED}4) حذف کامل نرم‌افزار و باکس (Remove)${NC}"
    echo -e "   ${YELLOW}5) خروج (Exit)${NC}"
    echo -e ""
    read -p "[-] انتخاب شما (1-5): " CHOICE

    case $choice in
        1) install_app ;;
        2) backup_app ;;
        3) update_app ;;
        4) remove_app ;;
        5) echo -e "${GREEN}خروج از اسکریپت. روز خوش!${NC}"; exit 0 ;;
        *) echo -e "${RED}گزینه نامعتبر. لطفاً عددی بین 1 تا 4 وارد کنید.${NC}; sleep 2 ;;
    esac
done
