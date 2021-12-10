import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Platform,
  Alert,
  ScrollView,
  Share,
  RefreshControl,
} from 'react-native';

import * as DevLauncher from '../DevLauncherInternal';
import BottomTabs from '../components/BottomTabs';
import Button from '../components/Button';
import ListItem from '../components/ListItem';
import SectionHeader from '../components/SectionHeader';
import { MainText, SecondaryText } from '../components/Text';
import UrlInput from '../components/UrlInput';
import { MainView, SecondaryView } from '../components/Views';
import { isDevMenuAvailable, queryDevSessionsAsync } from './../DevMenu';

const baseAddress = Platform.select({
  ios: 'http://localhost',
  android: 'http://10.0.2.2',
});
const statusPage = 'status';
const portsToCheck = [8081, 8082, 19000, 19001, 19002, 19003, 19004, 19005];

type State = {
  openedProjects: {
    name?: string;
    url: string;
    hideImage?: boolean;
  }[];
  onlineProjects: {
    description: string;
    source: 'snack' | 'desktop';
    url: string;
    hideImage?: boolean;
  }[];
  loadingApp: boolean;
  isRefreshing: boolean;
  pendingDeepLink: string | null;
};

type Props = { isUserLoggedIn: boolean; isSimulator: boolean };

const bottomContainerHeight = isDevMenuAvailable() ? 60 : 0;

class LauncherMainScreen extends React.Component<Props, State> {
  state: State = {
    openedProjects: [],
    onlineProjects: [],
    loadingApp: false,
    isRefreshing: false,
    pendingDeepLink: null,
  };

  private onNewDeepLink = DevLauncher.addDeepLinkListener(link =>
    this.setState({ pendingDeepLink: link })
  );

  componentDidMount() {
    DevLauncher.getPendingDeepLink().then(pendingDeepLink => {
      this.setState({ pendingDeepLink });
    });

    DevLauncher.getRecentlyOpenedApps().then(openedProjects => {
      const newOpenedProjects = [];
      for (const [url, name] of Object.entries(openedProjects)) {
        newOpenedProjects.push({
          url,
          name,
        });
      }

      this.setState({ openedProjects: newOpenedProjects });
    });

    this.fetchDevelopmentSessions();
  }

  componentWillUnmount() {
    this.onNewDeepLink.remove();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.isUserLoggedIn !== this.props.isUserLoggedIn) {
      this.fetchDevelopmentSessions();
    }
  }

  private detectLocalPackagers = async () => {
    if (!this.props.isSimulator) {
      return [];
    }

    const onlinePackagers = [];
    for (const port of portsToCheck) {
      try {
        const address = `${baseAddress}:${port}`;
        const { status } = await fetch(`${address}/${statusPage}`);
        if (status === 200) {
          onlinePackagers.push({
            description: address,
            url: address,
            source: 'desktop',
            hideImage: true,
          });
        }
      } catch (e) {}
    }

    return onlinePackagers;
  };

  private fetchDevelopmentSessions = async () => {
    if (!this.props.isUserLoggedIn) {
      const localPackagers = await this.detectLocalPackagers();
      if (this.props.isUserLoggedIn) {
        return;
      }
      this.setState({
        onlineProjects: localPackagers,
      });
      return;
    }

    const data = await queryDevSessionsAsync();
    const { data: projects } = JSON.parse(data);
    if (!this.props.isUserLoggedIn) {
      return;
    }

    this.setState({
      onlineProjects: projects,
    });
  };

  private refresh = async () => {
    this.setState({ isRefreshing: true });
    await this.fetchDevelopmentSessions();
    this.setState({ isRefreshing: false });
  };

  private loadApp = async url => {
    try {
      this.setState({ loadingApp: true });
      await DevLauncher.loadApp(url);
    } catch (e) {
      setTimeout(() => this.setState({ loadingApp: false }), 300);
      Alert.alert('Error loading app', e.message);
    }
  };

  private onPressScanAndroid = async () => {
    try {
      await DevLauncher.openCamera();
    } catch (e) {
      Alert.alert(
        "Couldn't open the camera app. Please, open the system camera and scan the QR code.",
        e.toString()
      );
    }
  };

  private renderCamera() {
    return Platform.select({
      ios: <MainText>Open your camera app and scan the QR generated by expo start</MainText>,
      android: (
        <View>
          <MainText style={styles.textMarginBottom}>Connect this client</MainText>
          <Button onPress={this.onPressScanAndroid} label="Scan QR code" />
        </View>
      ),
    });
  }

  private renderPendingDeepLink() {
    if (!this.state.pendingDeepLink) {
      return undefined;
    }

    return (
      <View style={styles.pendingDeepLinkContainer}>
        <View style={styles.pendingDeepLinkTextBox}>
          <Text style={styles.pendingDeepLinkInfo}>
            The application received a deep link. However, the development client couldn't decide
            where it should be dispatched. The next loaded project will handle the received deep
            link.
          </Text>
          <Text style={styles.pendingDeepLink}>{this.state.pendingDeepLink}</Text>
        </View>
      </View>
    );
  }

  private renderRecentlyInDevelopment() {
    const onlineProjects = this.state.onlineProjects
      // We're temporarily skipping snack projects
      .filter(project => project.source !== 'snack')
      .map(project => {
        const { url, description } = project;
        return (
          <ListItem
            key={url}
            title={description}
            subtitle={url}
            image={require('../assets/cli.png')}
            onPress={() => this.loadApp(url)}
            onLongPress={() => {
              const message = url;
              Share.share({
                title: url,
                message,
                url: message,
              });
            }}
          />
        );
      });

    return (
      <View>
        <SectionHeader title="Recently in development" />
        {onlineProjects.length ? (
          onlineProjects
        ) : (
          <ListItem subtitle="No projects are currently open." disabled />
        )}
      </View>
    );
  }

  private renderOpenedProjects() {
    const openedProjects = this.state.openedProjects.map(project => {
      const { url, name } = project;
      const title = name ?? url;
      return (
        <ListItem
          key={url}
          title={title}
          subtitle={name ? url : undefined}
          onPress={() => this.loadApp(url)}
        />
      );
    });

    return (
      <View>
        <SectionHeader title="Opened projects" />
        {openedProjects.length ? (
          openedProjects
        ) : (
          <ListItem subtitle="You haven't opened any projects recently." disabled />
        )}
      </View>
    );
  }

  render() {
    if (this.state.loadingApp) {
      return (
        <View style={styles.loadingContainer}>
          <MainText style={styles.loadingText}>Loading...</MainText>
        </View>
      );
    }

    return (
      <View style={styles.container} testID="DevLauncherMainScreen">
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={this.state.isRefreshing} onRefresh={this.refresh} />
          }>
          {this.renderPendingDeepLink()}
          <MainView>
            <MainText style={styles.header}>DEVELOPMENT CLIENT</MainText>
          </MainView>
          <SectionHeader title="Connected to a development server" />
          <MainView style={styles.sectionContainer}>
            <MainText style={styles.textMarginBottom}>Start a local server with:</MainText>
            <SecondaryView style={[styles.codeBox, styles.marginBottom]}>
              <SecondaryText style={styles.codeText}>expo start --dev-client</SecondaryText>
            </SecondaryView>

            {this.renderCamera()}
            <View style={styles.marginBottom} />
            <UrlInput onPress={this.loadApp} />
          </MainView>
          {this.renderRecentlyInDevelopment()}
          {this.renderOpenedProjects()}
        </ScrollView>
        {bottomContainerHeight > 0 && <BottomTabs height={bottomContainerHeight} />}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    marginBottom: bottomContainerHeight,
  },

  pendingDeepLinkContainer: {
    paddingHorizontal: -24,
    backgroundColor: '#4630eb',
  },
  pendingDeepLinkTextBox: {
    padding: 10,
  },
  pendingDeepLinkInfo: {
    color: '#f5f5f7',
  },
  pendingDeepLink: {
    marginTop: 10,
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  header: {
    fontSize: 16,
    paddingHorizontal: 15,
    paddingVertical: 20,
    fontWeight: '500',
  },

  sectionContainer: {
    paddingTop: 10,
    paddingBottom: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
  },

  codeBox: {
    borderWidth: 1,
    padding: 14,
    borderRadius: 4,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
  },

  marginBottom: {
    marginBottom: 15,
  },

  textMarginBottom: {
    marginBottom: 8,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  loadingText: {
    fontSize: 24,
  },
});

export default LauncherMainScreen;
