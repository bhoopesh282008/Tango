# Stores the Copernicus Data Space S3 keys as Windows user environment variables,
# where the pipeline reads them (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
# Run it, paste each key when asked, press Enter. Nothing is written to any file.

Write-Host ''
Write-Host 'Copernicus Data Space S3 keys' -ForegroundColor Cyan
Write-Host 'Copy each key from the S3 Credentials page and paste it here (right-click pastes).'
Write-Host ''

$access = (Read-Host 'Paste the ACCESS key, then press Enter').Trim()
if ($access -notmatch '^[A-Za-z0-9]{16,32}$') {
    Write-Host 'That does not look like an access key (expected about 20 letters and digits). Nothing was changed.' -ForegroundColor Red
    exit 1
}

# The secret is hidden while you paste it.
$secure = Read-Host 'Paste the SECRET key, then press Enter (it stays hidden)' -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($secret -notmatch '^[A-Za-z0-9+/=]{30,64}$') {
    Write-Host 'That does not look like a secret key (expected about 40 letters and digits). Nothing was changed.' -ForegroundColor Red
    exit 1
}
if ($secret -eq $access) {
    Write-Host 'The secret is the same as the access key. Nothing was changed.' -ForegroundColor Red
    exit 1
}

[Environment]::SetEnvironmentVariable('AWS_ACCESS_KEY_ID', $access, 'User')
[Environment]::SetEnvironmentVariable('AWS_SECRET_ACCESS_KEY', $secret, 'User')

Write-Host ''
Write-Host 'Saved. Now close and reopen the Claude app so it can see the keys.' -ForegroundColor Green
