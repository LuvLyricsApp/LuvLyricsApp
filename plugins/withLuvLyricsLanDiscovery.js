const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

function withAndroidNsd(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const usesPermissions = manifest['uses-permission'] || [];
    const needed = [
      'android.permission.INTERNET',
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.CHANGE_WIFI_MULTICAST_STATE',
      'android.permission.NEARBY_WIFI_DEVICES',
    ];
    for (const name of needed) {
      if (!usesPermissions.find((p) => p.$['android:name'] === name)) {
        usesPermissions.push({ $: { 'android:name': name } });
      }
    }
    manifest['uses-permission'] = usesPermissions;
    return cfg;
  });
}

function withIosBonjour(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSLocalNetworkUsageDescription =
      cfg.modResults.NSLocalNetworkUsageDescription ||
      'LuvLyrics uses your local network for desktop pairing and control.';
    const bonjour = new Set(cfg.modResults.NSBonjourServices || []);
    bonjour.add('_luvlyrics._tcp');
    cfg.modResults.NSBonjourServices = Array.from(bonjour);
    return cfg;
  });
}

module.exports = function withLuvLyricsLanDiscovery(config) {
  config = withAndroidNsd(config);
  config = withIosBonjour(config);
  return config;
};
