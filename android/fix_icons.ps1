Add-Type -AssemblyName System.Drawing

$sourcePath = "C:\Users\funnM\.gemini\antigravity\brain\23eea8c3-ba51-4443-aca0-1dcf4ee96882\naoflix_app_icon_1774573231834.png"
$resDir = "C:\Users\funnM\Documents\AniFlix\android\app\src\main\res"

$sizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

$bmp = [System.Drawing.Bitmap]::FromFile($sourcePath)

foreach ($folder in $sizes.Keys) {
    $size = $sizes[$folder]
    $newBmp = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($newBmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($bmp, 0, 0, $size, $size)
    $graphics.Dispose()
    
    $outPath1 = "$resDir\$folder\ic_launcher.png"
    $outPath2 = "$resDir\$folder\ic_launcher_round.png"
    $outPath3 = "$resDir\$folder\ic_launcher_foreground.png"
    
    $newBmp.Save($outPath1, [System.Drawing.Imaging.ImageFormat]::Png)
    $newBmp.Save($outPath2, [System.Drawing.Imaging.ImageFormat]::Png)
    $newBmp.Save($outPath3, [System.Drawing.Imaging.ImageFormat]::Png)
    $newBmp.Dispose()
}

$512Bmp = New-Object System.Drawing.Bitmap(512, 512)
$g512 = [System.Drawing.Graphics]::FromImage($512Bmp)
$g512.DrawImage($bmp, 0, 0, 512, 512)
$g512.Dispose()
$512Bmp.Save("$resDir\playstore-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$512Bmp.Dispose()

$bmp.Dispose()
Write-Host "Done resizing and cleaning PNGs!"
