{ lib, buildNpmPackage, nodejs, makeWrapper }:

buildNpmPackage rec {
  pname = "for-sure-swile";
  version = "0.1.0";

  src = ./.;

  npmDepsHash = "sha256-shoomrSyWjDwhHkWN+6Qq3oxSPHgojCZQj8goxVvHVs=";

  dontNpmInstall = true;

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall
    mkdir -p $out/{bin,lib/for-sure-swile}
    cp -r dist node_modules $out/lib/for-sure-swile/
    makeWrapper ${lib.getExe nodejs} $out/bin/for-sure-swile \
      --add-flags "$out/lib/for-sure-swile/dist/index.js"
    runHook postInstall
  '';

  meta = {
    description = "Swile connector for Sure (Lunchflow-compatible shim)";
    license = lib.licenses.mit;
    mainProgram = "for-sure-swile";
  };
}
