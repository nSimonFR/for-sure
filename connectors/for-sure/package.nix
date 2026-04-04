{ lib, buildNpmPackage, nodejs, makeWrapper }:

buildNpmPackage rec {
  pname = "for-sure";
  version = "0.1.0";

  src = ../..;                         # monorepo root (has package-lock.json)
  npmWorkspace = "connectors/for-sure";

  npmDepsHash = "sha256-YcQfz2enEF2tBnTN4Sh2RzvAlI1bH/Qa9gLaGZQUqWo=";

  dontNpmInstall = true;
  nativeBuildInputs = [ makeWrapper ];

  buildPhase = ''
    runHook preBuild
    npm run build --workspace=packages/lunchflow
    npm run build --workspace=connectors/for-sure
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/{bin,lib/for-sure/node_modules/@for-sure/lunchflow}
    cp -r connectors/for-sure/dist $out/lib/for-sure/
    cp -r packages/lunchflow/dist  $out/lib/for-sure/node_modules/@for-sure/lunchflow/dist
    cp packages/lunchflow/package.json $out/lib/for-sure/node_modules/@for-sure/lunchflow/

    makeWrapper ${lib.getExe nodejs} $out/bin/for-sure \
      --add-flags "$out/lib/for-sure/dist/index.js"

    runHook postInstall
  '';

  meta = {
    description = "Combined Swile + Sumeria connector for Sure (Lunchflow-compatible shim)";
    license     = lib.licenses.mit;
    mainProgram = "for-sure";
    platforms   = [ "aarch64-linux" "x86_64-linux" ];
  };
}
