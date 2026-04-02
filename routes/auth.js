const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// 飞书OAuth配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_REDIRECT_URI = process.env.FEISHU_REDIRECT_URI;

// 飞书OAuth 2.0端点
const FEISHU_AUTH_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token';
const FEISHU_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';

// 获取tenant_access_token（应用访问凭证）
async function getTenantAccessToken() {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            app_id: FEISHU_APP_ID,
            app_secret: FEISHU_APP_SECRET
        })
    });
    
    const data = await response.json();
    if (data.code !== 0) {
        throw new Error(`获取tenant_access_token失败: ${data.msg}`);
    }
    return data.tenant_access_token;
}

// 生成state参数（防CSRF攻击）
function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

// 登录页面
router.get('/login', (req, res) => {
    const state = generateState();
    req.session.oauthState = state;
    
    // 构造飞书授权URL
    const authUrl = `${FEISHU_AUTH_URL}?app_id=${FEISHU_APP_ID}&redirect_uri=${encodeURIComponent(FEISHU_REDIRECT_URI)}&state=${state}`;
    
    // 渲染登录页面
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录 - 医疗器械合规管理平台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-2xl p-12 max-w-md w-full">
        <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-full mb-4">
                <i class="ri-hospital-line text-4xl text-white"></i>
            </div>
            <h1 class="text-2xl font-bold text-gray-800">医疗器械合规管理平台</h1>
            <p class="text-gray-500 mt-2">Medical Device Compliance Platform</p>
        </div>
        
        <a href="${authUrl}" class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg text-center transition duration-200 flex items-center justify-center gap-2">
            <i class="ri-feishu-fill text-xl"></i>
            使用飞书账号登录
        </a>
        
        <div class="mt-6 text-center text-sm text-gray-500">
            <p>需要企业管理员授权后才能使用</p>
        </div>
    </div>
</body>
</html>
    `);
});

// OAuth回调
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    
    // 验证state防止CSRF攻击
    if (!state || state !== req.session.oauthState) {
        return res.status(400).send('无效的登录请求');
    }
    
    try {
        // 1. 获取tenant_access_token
        const tenantAccessToken = await getTenantAccessToken();
        
        // 2. 使用code换取user_access_token
        const tokenResponse = await fetch(FEISHU_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tenantAccessToken}`
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: code
            })
        });
        
        const tokenData = await tokenResponse.json();
        if (tokenData.code !== 0) {
            throw new Error(`获取access_token失败: ${tokenData.msg}`);
        }
        
        const userAccessToken = tokenData.data.access_token;
        
        // 3. 获取用户信息
        const userInfoResponse = await fetch(FEISHU_USER_INFO_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userAccessToken}`
            }
        });
        
        const userInfoData = await userInfoResponse.json();
        if (userInfoData.code !== 0) {
            throw new Error(`获取用户信息失败: ${userInfoData.msg}`);
        }
        
        const user = userInfoData.data;
        
        // 4. 保存用户信息到session
        req.session.user = {
            openId: user.open_id,
            name: user.name,
            avatar: user.avatar_url,
            email: user.email,
            mobile: user.mobile,
            userId: user.user_id
        };
        
        // 5. 重定向到首页
        res.redirect('/');
        
    } catch (error) {
        console.error('飞书登录失败:', error);
        res.status(500).send(`
            <h1>登录失败</h1>
            <p>${error.message}</p>
            <a href="/auth/login">重新登录</a>
        `);
    }
});

// 登出
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

// 获取当前用户信息
router.get('/user', (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.status(401).json({ error: '未登录' });
    }
});

module.exports = router;
