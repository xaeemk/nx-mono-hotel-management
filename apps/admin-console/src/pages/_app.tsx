import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { AppProps } from 'next/app';
import { SWRConfig } from 'swr';
import { theme } from '../utils/theme';
import { SocketProvider } from '../utils/socket';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function CustomApp({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <SWRConfig
        value={{
          fetcher,
          refreshInterval: 30000, // Refresh every 30 seconds
          revalidateOnFocus: false,
          revalidateOnReconnect: true,
        }}
      >
        <SocketProvider>
          <Component {...pageProps} />
        </SocketProvider>
      </SWRConfig>
    </ChakraProvider>
  );
}

export default CustomApp;
