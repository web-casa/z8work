# Windows PowerShell 5.1 adapter. Arguments are data in JSON, never evaluated code.
# Uses an existing test certificate; never creates/exports keys or changes trust.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RequestPath,
    [Parameter(Mandatory = $true)][string]$ResponsePath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$identity = 'Z8Work.Desktop.Dev'
$publisher = 'CN=Z8.Work Development'
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitProcess -or
    $env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or
    ($env:PROCESSOR_ARCHITEW6432 -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64')) {
    throw 'Requires native Windows x64 Windows PowerShell'
}
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this test as a non-elevated test user, after preparing certificate trust separately'
}
$request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($request.version -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Invalid version' }
if (Test-Path -LiteralPath $ResponsePath) { throw 'Response already exists' }

function Get-Registration {
    $packages = @(Get-AppxPackage -Name $identity)
    if ($packages.Count -ne 1) { throw 'Expected exactly one current-user development package' }
    $package = $packages[0]
    if ($package.Publisher -cne $publisher -or $package.Version.ToString() -ne $request.version -or
        $package.Architecture.ToString() -ne 'X64' -or $package.IsDevelopmentMode -or
        $package.Status.ToString() -ne 'Ok') { throw 'Unexpected installed identity or state' }
    return @{
        name = $package.Name; publisher = $package.Publisher; version = $package.Version.ToString()
        architecture = $package.Architecture.ToString(); status = $package.Status.ToString()
        developmentMode = [bool]$package.IsDevelopmentMode; publisherId = $package.PublisherId
        fullName = $package.PackageFullName; location = $package.InstallLocation
    }
}
function Assert-NoExistingPackage {
    if (@(Get-AppxPackage -Name $identity).Count -ne 0) {
        throw 'An existing development installation belongs to the user; refusing replacement or removal'
    }
}

$result = switch ($request.action) {
    'preflight' {
        Assert-NoExistingPackage
        if ($request.thumbprint -notmatch '^[A-Fa-f0-9]{40}$') { throw 'Invalid certificate thumbprint' }
        $certificate = Get-Item -LiteralPath ("Cert:\CurrentUser\My\" + $request.thumbprint)
        if ($certificate.Subject -cne $publisher -or -not $certificate.HasPrivateKey -or
            $certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -le (Get-Date)) {
            throw 'Expected an unexpired development signing certificate with private key in CurrentUser My'
        }
        @{ status = 'passed'; certificate = $certificate.Thumbprint; subject = $certificate.Subject }
    }
    'signature' {
        $signature = Get-AuthenticodeSignature -LiteralPath $request.package
        if ($signature.Status.ToString() -ne 'Valid' -or
            $signature.SignerCertificate.Thumbprint -ne $request.thumbprint -or
            $signature.SignerCertificate.Subject -cne $publisher) { throw 'Wrong or untrusted MSIX signer' }
        @{ status = 'passed'; signer = $signature.SignerCertificate.Thumbprint }
    }
    'install' {
        Assert-NoExistingPackage
        Add-AppxPackage -Path $request.package
        Get-Registration
    }
    'registration' { Get-Registration }
    'uninstall' {
        $registration = Get-Registration
        if ($registration.fullName -cne $request.fullName -or
            $registration.location -cne $request.location) { throw 'Installed package changed; refusing removal' }
        Remove-AppxPackage -Package $registration.fullName
        Assert-NoExistingPackage
        @{ status = 'passed'; removed = $registration.fullName }
    }
    default { throw 'Unsupported MSIX test action' }
}
$json = $result | ConvertTo-Json -Depth 8
$encoding = New-Object System.Text.UTF8Encoding($false)
$stream = [System.IO.File]::Open($ResponsePath, [System.IO.FileMode]::CreateNew)
try {
    $bytes = $encoding.GetBytes($json + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
} finally { $stream.Dispose() }
