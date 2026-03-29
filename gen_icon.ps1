Add-Type -AssemblyName System.Drawing

$text = "NF"
$baseDir = "c:\Users\funnM\Documents\AniFlix\android\app\src\main\res"
$sizes = @{
    "mipmap-mdpi" = 24
    "mipmap-hdpi" = 36
    "mipmap-xhdpi" = 48
    "mipmap-xxhdpi" = 72
    "mipmap-xxxhdpi" = 96
}

foreach ($item in $sizes.GetEnumerator()) {
    $folder = $item.Key
    $size = $item.Value
    
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    
    $fontFamily = New-Object System.Drawing.FontFamily("Arial")
    $fontSize = [float]($size * 0.45)
    $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
    
    $stringFormat = New-Object System.Drawing.StringFormat
    $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $rect = New-Object System.Drawing.RectangleF -ArgumentList 0, 0, $size, $size
    $graphics.DrawString($text, $font, $brush, $rect, $stringFormat)
    
    $folderPath = Join-Path -Path $baseDir -ChildPath $folder
    if (-not (Test-Path -Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath | Out-Null
    }
    
    $outPath = Join-Path -Path $folderPath -ChildPath "ic_stat_onesignal_default.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created $outPath"
    
    $graphics.Dispose()
    $bmp.Dispose()
}
