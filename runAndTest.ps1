cd "d:\School ERP\Backend"

# Start server in visible window
Write-Host "Starting server..."
$process = Start-Process -FilePath "node" -ArgumentList "server.js" -PassThru

# Wait for server to start and stabilize
Start-Sleep -Seconds 5

# Run test in current window
Write-Host "Running API test..."
node testAPI.js 2>&1

# Kill server
Write-Host "Shutting down server..."
Stop-Process -Id $process.Id -Force
