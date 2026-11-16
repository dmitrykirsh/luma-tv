$ErrorActionPreference = 'Stop'
$ndk = Join-Path $env:ANDROID_HOME 'ndk/27.0.12077973/toolchains/llvm/prebuilt/windows-x86_64/bin'
$src = @('packets.c','main.c','conev.c','proxy.c','desync.c','mpool.c','extend.c') | ForEach-Object { Join-Path $PSScriptRoot "../vendor/byedpi/$_" }
$targets = @{ 'armeabi-v7a'='armv7a-linux-androideabi24'; 'arm64-v8a'='aarch64-linux-android24'; 'x86'='i686-linux-android24'; 'x86_64'='x86_64-linux-android24' }
foreach ($abi in $targets.Keys) {
  $out = Join-Path $PSScriptRoot "../app/src/main/jniLibs/$abi"
  New-Item -ItemType Directory -Force $out | Out-Null
  & (Join-Path $ndk ($targets[$abi] + '-clang.cmd')) -D_DEFAULT_SOURCE -std=c99 -O2 -fPIE -pie -Wno-unknown-attributes -o (Join-Path $out 'liblumayoutubeproxy.so') @src
  if ($LASTEXITCODE -ne 0) { throw "NDK build failed for $abi" }
}
