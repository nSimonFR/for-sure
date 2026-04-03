{ config, lib, pkgs, ... }:
let
  cfg = config.services.for-sure-swile;
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

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix {};
      description = "for-sure-swile package to use";
    };
  };

  config = lib.mkIf cfg.enable {
    users.users.for-sure-swile = {
      isSystemUser = true;
      group = "for-sure-swile";
      home = cfg.dataDir;
    };
    users.groups.for-sure-swile = {};

    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0750 for-sure-swile for-sure-swile -"
    ];

    systemd.services.for-sure-swile = {
      description = "for-sure-swile Lunchflow connector for Swile";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      serviceConfig = {
        Type = "simple";
        User = "for-sure-swile";
        Group = "for-sure-swile";
        ExecStartPre = "+" + pkgs.writeShellScript "for-sure-swile-env" ''
          API_KEY=$(cat ${cfg.apiKeyFile})
          cat > /run/for-sure-swile/env <<EOF
          FOR_SURE_API_KEY=$API_KEY
          EOF
          chown for-sure-swile:for-sure-swile /run/for-sure-swile/env
          chmod 0640 /run/for-sure-swile/env
        '';
        ExecStart = "${cfg.package}/bin/for-sure-swile";
        EnvironmentFile = "/run/for-sure-swile/env";
        RuntimeDirectory = "for-sure-swile";
        Restart = "on-failure";
        RestartSec = "10";
      };

      environment = {
        PORT = toString cfg.port;
        HOST = cfg.host;
        SWILE_TOKEN_FILE = "${cfg.dataDir}/tokens.json";
      };
    };
  };
}
