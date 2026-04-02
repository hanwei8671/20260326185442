#!/bin/bash
# 医疗器械合规管理平台 - 阿里云ECS一键部署脚本

set -e

echo "================================"
echo "开始部署医疗器械合规管理平台..."
echo "================================"

# 1. 更新系统
echo "[1/8] 更新系统..."
sudo apt update -y
sudo apt upgrade -y

# 2. 安装Node.js 20.x
echo "[2/8] 安装Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. 安装Git和PM2
echo "[3/8] 安装Git和PM2..."
sudo apt install -y git
sudo npm install -g pm2

# 4. 创建应用目录
echo "[4/8] 创建应用目录..."
mkdir -p /opt/mdr-system
cd /opt/mdr-system

# 5. 克隆代码（从GitHub）
echo "[5/8] 从GitHub克隆代码..."
# 使用你的GitHub仓库地址
sudo git clone https://github.com/hanwei8671/20260326185442.git .

# 6. 安装依赖
echo "[6/8] 安装项目依赖..."
cd /opt/mdr-system
sudo npm install

# 7. 创建环境变量文件
echo "[7/8] 配置环境变量..."
sudo tee /opt/mdr-system/.env << EOF
# FDA API 配置
FDA_API_BASE_URL=https://api.fda.gov

# 翻译服务配置
BAIDU_TRANSLATE_APP_ID=20260325002580384
BAIDU_TRANSLATE_SECRET_KEY=ZYEXulyVQt05pvRTrydp

# 数据库配置
DB_PATH=./data/mdr_database.db

# 定时任务配置
CRON_SCHEDULE=0 2 * * *

# 服务器配置
PORT=3000
NODE_ENV=production

# 日志配置
LOG_LEVEL=info

# AI 服务配置 - 小米 MiMo
OPENAI_API_KEY=sk-cr7v2z29zsr4asphydhvgn4918kav59g1k80emz24d96jktl
OPENAI_BASE_URL=https://api.xiaomimimo.com/v1
OPENAI_MODEL=mimo-v2-flash

# 飞书应用配置 - 需要修改为你的飞书应用配置
FEISHU_APP_ID=cli_a9264eee1538dcba
FEISHU_APP_SECRET=RS9OzXMemURZTFGTV4Q6pheL2ACF1SqT
FEISHU_REDIRECT_URI=http://115.29.195.218:3000/auth/callback
EOF

# 8. 创建数据目录
echo "[8/8] 创建数据目录..."
sudo mkdir -p /opt/mdr-system/data
sudo chown -R $(whoami):$(whoami) /opt/mdr-system

# 9. 启动服务
echo "启动服务..."
cd /opt/mdr-system
pm2 start server.js --name mdr-system
pm2 save
pm2 startup systemd -u $(whoami) --hp $HOME

echo ""
echo "================================"
echo "部署完成！"
echo "================================"
echo "访问地址: http://115.29.195.218:3000"
echo ""
echo "请完成以下步骤:"
echo "1. 在飞书开放平台更新回调URL:"
echo "   - 重定向URL: http://115.29.195.218:3000/auth/callback"
echo "   - 应用首页: http://115.29.195.218:3000"
echo "2. 检查服务状态: pm2 status"
echo "3. 查看日志: pm2 logs mdr-system"
echo "================================"
