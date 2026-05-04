$outputFile = "c:\Users\Lenovo\WorkBuddy\20260407193651\scripts\fetch-rss-output.log"
$workingDir = "c:\Users\Lenovo\WorkBuddy\20260407193651"

"=== RSS资讯自动抓取 ===" | Out-File -FilePath $outputFile -Encoding UTF8
"开始时间: $(Get-Date)" | Out-File -FilePath $outputFile -Append -Encoding UTF8
"" | Out-File -FilePath $outputFile -Append -Encoding UTF8

# 使用cmd来运行脚本并捕获输出
$cmd = "cd /d `"$workingDir`" && `"C:\nvm4w\nodejs\node.exe`" node_modules\tsx\dist\cli.mjs scripts/fetch-rss.ts"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WorkingDirectory $workingDir -RedirectStandardOutput $outputFile -RedirectStandardError "$workingDir\scripts\fetch-rss-error.log" -PassThru -Wait -NoNewWindow

"" | Out-File -FilePath $outputFile -Append -Encoding UTF8
"结束时间: $(Get-Date)" | Out-File -FilePath $outputFile -Append -Encoding UTF8
"Exit code: $($process.ExitCode)" | Out-File -FilePath $outputFile -Append -Encoding UTF8
