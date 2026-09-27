[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramDialog=NO
CertificateTitle=
CertificateSubject=
CertificateIssuer=
CertificateExpire=
ShowInstallProgramWindow=NO
HideExtractAnimation=YES
UseLongFileName=YES
InsideCompressed=NO
CAB_FixedSize=0
CAB_ResvCode=0
CAB_ResvPercent=0
WebDeployment=0
WebDeploymentType=0
WebDeploymentURL=

[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=C:\Users\gaore\WorkBuddy AI\2026-09-25-18-16-02\xhs-collector-setup.exe
FriendlyName=???????? ????
AppLaunched=cmd /c powershell.exe -ExecutionPolicy Bypass -NoProfile -File install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles

[SourceFiles]
SourceFiles0=C:\Users\gaore\WorkBuddy AI\2026-09-25-18-16-02\installer_build
[SourceFiles0]
%FILE0%=install.ps1
%FILE1%=xhs-collector.crx
%FILE2%=xhs-collector.pem
%FILE3%=xhs-collector-v1.0.0.tar.gz
