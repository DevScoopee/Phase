import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useNotifications } from './src/hooks/useNotifications';
import { useTransactionQueue } from './src/hooks/useTransactionQueue';
import ErrorBoundary from './src/components/ErrorBoundary';

// Import WalletConnect compatibility layer
import '@walletconnect/react-native-compat';

import { createAppKit, defaultConfig, AppKit } from '@reown/appkit-ethers-react-native';

import {
  WALLETCONNECT_APP_CHAINS,
  WALLETCONNECT_PROJECT_METADATA,
} from './src/services/walletconnect/chains';

// Get projectId from environment variable
const projectId = process.env.WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const config = defaultConfig({ metadata: WALLETCONNECT_PROJECT_METADATA });

// Create AppKit
createAppKit({
  projectId,
  metadata: WALLETCONNECT_PROJECT_METADATA,
  chains: WALLETCONNECT_APP_CHAINS,
  config,
  enableAnalytics: true,
});

function NotificationBootstrap() {
  useNotifications();
  useTransactionQueue();
  return null;
}

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <ErrorBoundary>
        <NotificationBootstrap />
        <AppNavigator />
      </ErrorBoundary>
      <AppKit />
    </>
  );
}
