{ config, lib, pkgs, ... }:
let
  cfg = config.services.for-sure-swile;
  pkg = pkgs.callPackage ./package.nix {};
in
{
  options.services.for-sure-swile = {
    enable = lib.mkEnableOption "for-sure-swile Lunchflow connector";

    port = lib.mkOption {
      type = lib.types.port;
      default = 8340;
      description = "Port to listen on";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address to bind to";
    };

    dataDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/for-sure-swile";
      description = "Directory for token storage";
    };

    apiKeyFile = lib.mkOption {
      type = lib.types.str;
      description = "Path to file containing the API key for authentication";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.for-sure-swile = {
      description = "for-sure-swile Lunchflow connector for Swile";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      serviceConfig = {
        ExecStart = "${pkg}/bin/for-sure-swile";
        DynamicUser = true;
        StateDirectory = "for-sure-swile";
        LoadCredential = "api-key:${cfg.apiKeyFile}";
        Restart = "on-failure";
        RestartSec = "10";
      };

      environment = {
        PORT = toString cfg.port;
        HOST = cfg.host;
        SWILE_TOKEN_FILE = "${cfg.dataDir}/tokens.json";
        # CREDENTIALS_DIRECTORY is set by systemd; config.ts resolves the full path
        SWILE_API_KEY_FILE = "api-key";
      };
    };
  };
}
