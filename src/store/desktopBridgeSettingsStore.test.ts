const mockMultiGet = jest.fn();
const mockSetItem = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockUpdateControlPort = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    multiGet: mockMultiGet,
    setItem: mockSetItem,
  },
}));

jest.mock('../services/DesktopBridgeService', () => ({
  desktopBridgeService: {
    start: mockStart,
    stop: mockStop,
    updateControlPort: mockUpdateControlPort,
  },
}));

import { useDesktopBridgeSettingsStore } from './desktopBridgeSettingsStore';

describe('desktopBridgeSettingsStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDesktopBridgeSettingsStore.setState({
      desktopConnectEnabled: false,
      allowDesktopDownloads: false,
      controlPort: 8765,
    });
  });

  it('keeps the network bridge and remote downloads disabled on first launch', async () => {
    mockMultiGet.mockResolvedValue([
      ['@desktop_bridge_enabled', null],
      ['@desktop_bridge_allow_downloads', null],
      ['@desktop_bridge_control_port', null],
    ]);

    await useDesktopBridgeSettingsStore.getState().load();

    expect(useDesktopBridgeSettingsStore.getState()).toMatchObject({
      desktopConnectEnabled: false,
      allowDesktopDownloads: false,
      controlPort: 8765,
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockUpdateControlPort).not.toHaveBeenCalled();
  });

  it('starts only when the user previously opted in', async () => {
    mockMultiGet.mockResolvedValue([
      ['@desktop_bridge_enabled', 'true'],
      ['@desktop_bridge_allow_downloads', 'false'],
      ['@desktop_bridge_control_port', '9123'],
    ]);

    await useDesktopBridgeSettingsStore.getState().load();

    expect(mockUpdateControlPort).toHaveBeenCalledWith(9123);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
