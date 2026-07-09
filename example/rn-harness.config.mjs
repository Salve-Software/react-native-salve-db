import { androidEmulator, androidPlatform } from '@react-native-harness/platform-android'
import { applePlatform, appleSimulator } from '@react-native-harness/platform-apple'

const config = {
  entryPoint: './index.js',
  appRegistryComponentName: 'SalveDbExample',
  runners: [
    androidPlatform({
      name: 'android',
      device: androidEmulator(process.env.AVD_NAME ?? 'Pixel_7_API_36', {
        apiLevel: Number(process.env.DEVICE_API_LEVEL ?? '36'),
        profile: process.env.DEVICE_PROFILE ?? 'pixel_7',
        diskSize: process.env.AVD_DISK_SIZE ?? '1G',
        heapSize: process.env.AVD_HEAP_SIZE ?? '1G',
        snapshot: {
          enabled: process.env.CI === 'true',
        },
      }),
      bundleId: 'com.salvedbexample',
    }),
    applePlatform({
      name: 'ios',
      device: appleSimulator(
        process.env.DEVICE_MODEL ?? 'iPhone 17 Pro',
        process.env.IOS_VERSION ?? '26.5'
      ),
      bundleId: 'com.salvedbexample',
    })
  ],
  defaultRunner: 'android',
  bridgeTimeout: 300000,
}

export default config
