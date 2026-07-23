Add-Type -AssemblyName System.Drawing

$splashPath = "C:\Users\funnM\Documents\AniFlix\android\app\src\main\res\drawable\splashscreen_image.png"

$bmp = [System.Drawing.Bitmap]::FromFile($splashPath)
$newBmp = New-Object System.Drawing.Bitmap(512, 512)
$graphics = [System.Drawing.Graphics]::FromImage($newBmp)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($bmp, 0, 0, 512, 512)
$graphics.Dispose()
$bmp.Dispose()

$newBmp.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
$newBmp.Dispose()

Write-Host "Done stripping metadata from Splash Screen!"
