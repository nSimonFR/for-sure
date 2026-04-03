{
  description = "for-sure-swile: Swile → Lunchflow connector for Sure";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/release-25.11";
  };

  outputs = { self, nixpkgs }:
    let
      system = "aarch64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      packages.${system}.default = pkgs.callPackage ./package.nix {};

      nixosModules.default = import ./module.nix;
    };
}
