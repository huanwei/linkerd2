import ErrorBanner from './ErrorBanner.jsx';
import PropTypes from 'prop-types';
import React from 'react';
import TapQueryForm from './TapQueryForm.jsx';
import TopModule from './TopModule.jsx';
import _ from 'lodash';
import { emptyTapQuery } from './util/TapUtils.jsx';
import { withContext } from './util/AppContext.jsx';

class Top extends React.Component {
  static propTypes = {
    api: PropTypes.shape({
      PrefixedLink: PropTypes.func.isRequired,
    }).isRequired,
    pathPrefix: PropTypes.string.isRequired
  }

  constructor(props) {
    super(props);
    this.api = this.props.api;
    this.loadFromServer = this.loadFromServer.bind(this);
    this.updateTapClosingState = this.updateTapClosingState.bind(this);

    this.state = {
      error: null,
      resourcesByNs: {},
      authoritiesByNs: {},
      query: emptyTapQuery(),
      pollingInterval: 10000,
      tapRequestInProgress: false,
      pendingRequests: false
    };
  }

  componentDidMount() {
    this.startServerPolling();
  }

  componentWillUnmount() {
    this.stopServerPolling();
  }

  getResourcesByNs(rsp) {
    let statTables = _.get(rsp, [0, "ok", "statTables"]);
    let authoritiesByNs = {};
    let resourcesByNs = _.reduce(statTables, (mem, table) => {
      _.each(table.podGroup.rows, row => {
        if (row.meshedPodCount === "0") {
          return;
        }

        if (!mem[row.resource.namespace]) {
          mem[row.resource.namespace] = [];
          authoritiesByNs[row.resource.namespace] = [];
        }

        switch (row.resource.type.toLowerCase()) {
          case "service":
            break;
          case "authority":
            authoritiesByNs[row.resource.namespace].push(row.resource.name);
            break;
          default:
            mem[row.resource.namespace].push(`${row.resource.type}/${row.resource.name}`);
        }
      });
      return mem;
    }, {});
    return {
      authoritiesByNs,
      resourcesByNs
    };
  }

  startServerPolling() {
    this.loadFromServer();
    this.timerId = window.setInterval(this.loadFromServer, this.state.pollingInterval);
  }

  stopServerPolling() {
    window.clearInterval(this.timerId);
    this.api.cancelCurrentRequests();
  }

  loadFromServer() {
    if (this.state.pendingRequests) {
      return; // don't make more requests if the ones we sent haven't completed
    }
    this.setState({
      pendingRequests: true
    });

    let url = this.api.urlsForResource("all");
    this.api.setCurrentRequests([this.api.fetchMetrics(url)]);
    this.serverPromise = Promise.all(this.api.getCurrentPromises())
      .then(rsp => {
        let { resourcesByNs, authoritiesByNs } = this.getResourcesByNs(rsp);

        this.setState({
          resourcesByNs,
          authoritiesByNs,
          pendingRequests: false
        });
      })
      .catch(this.handleApiError);
  }

  handleApiError = e => {
    if (e.isCanceled) {
      return;
    }

    this.setState({
      pendingRequests: false,
      error: e
    });
  }

  updateQuery = query => {
    this.setState({
      query
    });
  }

  handleTapStart = () => {
    this.setState({
      tapRequestInProgress: true
    });
  }

  handleTapStop = () => {
    this.setState({
      tapRequestInProgress: false,
      tapIsClosing: true
    });
  }

  handleTapClear = () => {
    this.setState({
      error: null,
      query: emptyTapQuery()
    });
  }

  updateTapClosingState(isTapClosing) {
    this.setState({
      tapIsClosing: isTapClosing
    });
  }

  render() {
    return (
      <div>
        {!this.state.error ? null :
        <ErrorBanner message={this.state.error} onHideMessage={() => this.setState({ error: null })} />}
        <TapQueryForm
          enableAdvancedForm={false}
          cmdName="top"
          handleTapStart={this.handleTapStart}
          handleTapStop={this.handleTapStop}
          handleTapClear={this.handleTapClear}
          resourcesByNs={this.state.resourcesByNs}
          authoritiesByNs={this.state.authoritiesByNs}
          tapRequestInProgress={this.state.tapRequestInProgress}
          tapIsClosing={this.state.tapIsClosing}
          updateQuery={this.updateQuery}
          query={this.state.query} />

        <TopModule
          pathPrefix={this.props.pathPrefix}
          query={this.state.query}
          startTap={this.state.tapRequestInProgress}
          updateTapClosingState={this.updateTapClosingState} />
      </div>
    );
  }
}

export default withContext(Top);
