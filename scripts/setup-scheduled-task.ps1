# 设置本地定时任务 - 每天自动抓取AI工具和资讯
# 以管理员身份运行此脚本

$taskName = "AI-Navigator-Local-Crawler"
$taskDescription = "AI工具导航站本地数据自动抓取 - 每天运行crawl:latest和crawl:rss"

# 工作目录和脚本路径
$workingDir = "C:\Users\Lenovo\WorkBuddy\20260407193651"
$batchScript = "$workingDir\scripts\local-crawler.bat"

# 创建触发器 - 每天凌晨2点运行
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"

# 创建操作 - 运行批处理脚本
$action = New-ScheduledTaskAction -Execute $batchScript -WorkingDirectory $workingDir

# 创建设置 - 如果任务运行时间超过1小时则停止，如果错过时间立即运行
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable

# 注册任务（需要管理员权限）
try {
    Register-ScheduledTask -TaskName $taskName -Description $taskDescription `
        -Trigger $trigger -Action $action -Settings $settings `
        -RunLevel Highest -Force
    
    Write-Host "✅ 定时任务创建成功！" -ForegroundColor Green
    Write-Host "任务名称: $taskName" -ForegroundColor Cyan
    Write-Host "运行时间: 每天凌晨 2:00" -ForegroundColor Cyan
    Write-Host "执行脚本: $batchScript" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "你可以通过以下方式管理任务：" -ForegroundColor Yellow
    Write-Host "  - 查看: Get-ScheduledTask -TaskName '$taskName'"
    Write-Host "  - 运行: Start-ScheduledTask -TaskName '$taskName'"
    Write-Host "  - 删除: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
    Write-Host ""
    Write-Host "或者在 任务计划程序 (taskschd.msc) 中管理" -ForegroundColor Yellow
} catch {
    Write-Host "❌ 创建失败: $_" -ForegroundColor Red
    Write-Host "请确保以管理员身份运行PowerShell" -ForegroundColor Yellow
}
