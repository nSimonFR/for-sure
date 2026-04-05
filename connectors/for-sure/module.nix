{ config, lib, pkgs, ... }:
let
  cfg = config.services.for-sure;
  pkg = pkgs.callPackage ./package.nix {};
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
      description = "Directory for token storage (swile-tokens.json)";
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

    sumeria.tokenFile = lib.mkOption {
      type        = lib.types.nullOr lib.types.str;
      default     = null;
      description = "Path to sumeria-tokens.json written by an external token extractor";
    };

    telegram = {
      botTokenFile = lib.mkOption {
        type        = lib.types.nullOr lib.types.str;
        default     = null;
        description = "Path to file containing the Telegram bot token (for token-expiry alerts)";
      };

      chatId = lib.mkOption {
        type        = lib.types.nullOr lib.types.str;
        default     = null;
        description = "Telegram chat ID to send alerts to";
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
        PORT                  = toString cfg.port;
        HOST                  = cfg.host;
        FOR_SURE_DATA_DIR     = cfg.dataDir;
        FOR_SURE_API_KEY_FILE = cfg.apiKeyFile;
      } // lib.optionalAttrs (cfg.swile.accountName != null) {
        SWILE_ACCOUNT_NAME = cfg.swile.accountName;
      } // lib.optionalAttrs (cfg.sumeria.tokenFile != null) {
        SUMERIA_TOKEN_FILE = cfg.sumeria.tokenFile;
      } // lib.optionalAttrs (cfg.telegram.botTokenFile != null) {
        TELEGRAM_BOT_TOKEN_FILE = cfg.telegram.botTokenFile;
      } // lib.optionalAttrs (cfg.telegram.chatId != null) {
        TELEGRAM_CHAT_ID = cfg.telegram.chatId;
      };
    };
  };
}
