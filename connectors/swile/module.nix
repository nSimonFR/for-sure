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

    accountName = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "Override the account name shown in Sure (defaults to wallet label from Swile)";
    };
  };

  config = lib.mkIf cfg.enable {
    users.users.for-sure-swile = {
      isSystemUser = true;
      group = "for-sure-swile";
    };
    users.groups.for-sure-swile = {};

    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0700 for-sure-swile for-sure-swile - -"
    ];

    systemd.services.for-sure-swile = {
      description = "for-sure-swile Lunchflow connector for Swile";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      serviceConfig = {
        ExecStart = "${pkg}/bin/for-sure-swile";
        User = "for-sure-swile";
        Group = "for-sure-swile";
        Restart = "on-failure";
        RestartSec = "10";
        ReadWritePaths = [ cfg.dataDir ];
      };

      environment = {
        PORT = toString cfg.port;
        HOST = cfg.host;
        SWILE_TOKEN_FILE = "${cfg.dataDir}/tokens.json";
        SWILE_API_KEY_FILE = cfg.apiKeyFile;
      } // lib.optionalAttrs (cfg.accountName != null) {
        SWILE_ACCOUNT_NAME = cfg.accountName;
      };
    };
  };
}
