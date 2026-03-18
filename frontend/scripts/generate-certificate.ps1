# 为 Electron 应用生成自签名证书
# 在 PowerShell 中以管理员身份运行此脚本

$certName = "GrapWork"
$certSubject = "CN=GrapWork, O=MirrorGrap, C=CN"
$certPath = "build\certificates"
$pfxFile = "$certPath\grapework.pfx"
$cerFile = "$certPath\grapework.cer"

# 创建证书目录
if (!(Test-Path $certPath)) {
    New-Item -ItemType Directory -Path $certPath -Force
    Write-Host "已创建证书目录：$certPath" -ForegroundColor Green
}

# 检查证书是否已存在
$existingCert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -like "*$certName*" }

if ($existingCert) {
    Write-Host "找到已存在的证书：$($existingCert.Subject)" -ForegroundColor Yellow
    $cert = $existingCert
} else {
    # 创建新的自签名证书
    Write-Host "正在创建新的自签名证书..." -ForegroundColor Cyan
    $cert = New-SelfSignedCertificate `
        -Type Custom `
        -Subject $certSubject `
        -KeyUsage DigitalSignature `
        -KeyLength 2048 `
        -KeyAlgorithm RSA `
        -HashAlgorithm SHA256 `
        -FriendlyName $certName `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    
    Write-Host "证书已创建并安装到当前用户的证书存储区" -ForegroundColor Green
}

# 导出 PFX 文件（包含私钥）
$password = ConvertTo-SecureString -String "grapeWork2026" -Force -AsPlainText
try {
    Export-PfxCertificate -Cert $cert -FilePath $pfxFile -Password $password -Force | Out-Null
    Write-Host "已导出 PFX 文件：$pfxFile" -ForegroundColor Green
} catch {
    Write-Host "导出 PFX 失败：$($_.Exception.Message)" -ForegroundColor Red
}

# 导出 CER 文件（仅公钥）
try {
    Export-Certificate -Cert $cert -FilePath $cerFile -Force | Out-Null
    Write-Host "已导出 CER 文件：$cerFile" -ForegroundColor Green
} catch {
    Write-Host "导出 CER 失败：$($_.Exception.Message)" -ForegroundColor Red
}

# 将证书添加到受信任的根证书颁发机构（避免签名警告）
Write-Host "正在将证书添加到受信任的根证书颁发机构..." -ForegroundColor Cyan
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store "Root", "CurrentUser"
$rootStore.Open("ReadWrite")
$rootStore.Add($cert)
$rootStore.Close()

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "证书生成完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "PFX 文件：$pfxFile"
Write-Host "CER 文件：$cerFile"
Write-Host "证书密码：grapeWork2026"
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "`n使用此证书构建 Windows 应用：" -ForegroundColor Yellow
Write-Host "npm run electron:build:win"
Write-Host "`n证书指纹 (SHA1): $($cert.Thumbprint)" -ForegroundColor Cyan
