{ config, lib, pkgs, ... }:
let
  cfg = config.services.for-sure;
  pkg = pkgs.callPackage ./package.nix {};

  tokenExtractor = pkgs.writeText "sumeria-token-extractor.py" ''
    import json, os
    from mitmproxy import http

    TOKEN_FILE = os.environ.get("SUMERIA_TOKEN_FILE", "/var/lib/for-sure/sumeria-tokens.json")

    class SumeriaTokenExtractor:
        def request(self, flow: http.HTTPFlow):
            if "api.lydia-app.com" not in flow.request.host:
                return
            h = flow.request.headers
            if h.get("auth_token") and h.get("public_token") and h.get("access-token"):
                tokens = {
                    "auth_token":   h["auth_token"],
                    "public_token": h["public_token"],
                    "access_token": h["access-token"],
                }
                tmp = TOKEN_FILE + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(tokens, f, indent=2)
                os.rename(tmp, TOKEN_FILE)

    addons = [SumeriaTokenExtractor()]
  '';
in
{
  options.services.for-sure = {
    enable = lib.mkEnableOption "for-sure Lunchflow connector (Swile + Sumeria)";

    port = lib.mkOption {
      type        = lib.types.port;
      default     = 8340;
      description = "Port to listen on";
    };

    host = lib.mkOption {
      type        = lib.types.str;
      default     = "127.0.0.1";
      description = "Address to bind to";
    };

    dataDir = lib.mkOption {
      type        = lib.types.str;
      default     = "/var/lib/for-sure";
      description = "Directory for token storage (swile-tokens.json, sumeria-tokens.json)";
    };

    apiKeyFile = lib.mkOption {
      type        = lib.types.str;
      description = "Path to file containing the API key for authenticating Sure requests";
    };

    swile.accountName = lib.mkOption {
      type        = lib.types.nullOr lib.types.str;
      default     = null;
      description = "Override the account name shown in Sure (defaults to wallet label from Swile)";
    };

    mitm = {
      enable = lib.mkEnableOption "persistent mitmproxy service for Sumeria token auto-capture";

      port = lib.mkOption {
        type        = lib.types.port;
        default     = 8889;
        description = "Port for the mitmproxy HTTP proxy (configure iPhone to use this)";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    users.users.for-sure  = { isSystemUser = true; group = "for-sure"; };
    users.groups.for-sure = {};

    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0700 for-sure for-sure - -"
    ];

    systemd.services.for-sure = {
      description = "for-sure Lunchflow connector (Swile + Sumeria)";
      wantedBy    = [ "multi-user.target" ];
      after       = [ "network-online.target" ];
      wants       = [ "network-online.target" ];

      serviceConfig = {
        ExecStart      = "${pkg}/bin/for-sure";
        User           = "for-sure";
        Group          = "for-sure";
        Restart        = "on-failure";
        RestartSec     = "10";
        ReadWritePaths = [ cfg.dataDir ];
      };

      environment = {
        PORT                 = toString cfg.port;
        HOST                 = cfg.host;
        FOR_SURE_DATA_DIR    = cfg.dataDir;
        FOR_SURE_API_KEY_FILE = cfg.apiKeyFile;
      } // lib.optionalAttrs (cfg.swile.accountName != null) {
        SWILE_ACCOUNT_NAME = cfg.swile.accountName;
      };
    };

    systemd.services.for-sure-mitm = lib.mkIf cfg.mitm.enable {
      description = "Sumeria token auto-extractor (mitmproxy)";
      wantedBy    = [ "multi-user.target" ];
      after       = [ "network-online.target" ];
      wants       = [ "network-online.target" ];

      serviceConfig = {
        ExecStart = lib.concatStringsSep " " [
          "${pkgs.mitmproxy}/bin/mitmdump"
          "--mode regular"
          "-p ${toString cfg.mitm.port}"
          "--ignore-hosts '(?!api\\.lydia-app\\.com).*'"
          "--set confdir=${cfg.dataDir}/mitmproxy"
          "-s ${tokenExtractor}"
        ];
        User           = "for-sure";
        Group          = "for-sure";
        Restart        = "on-failure";
        RestartSec     = "5";
        ReadWritePaths = [ cfg.dataDir ];
      };

      environment.SUMERIA_TOKEN_FILE = "${cfg.dataDir}/sumeria-tokens.json";
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.mitm.enable [ cfg.mitm.port ];
  };
}
