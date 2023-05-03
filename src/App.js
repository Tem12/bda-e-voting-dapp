import React from 'react';
import { Toast } from 'bootstrap';
import { SecretNetworkClient } from 'secretjs';
import { WalletState, InteractState } from './types';
import { DateTime, Duration } from 'luxon';
import TagsInput from 'react-tagsinput';
import Logo from './assets/icons/secret-logo.svg';
import ErrorIcon from './assets/icons/error.svg';
import RefreshIcon from './assets/icons/refresh.svg';

import './App.scss';
import './TagsInput.scss';
import DatePicker from './Components/DatePicker';

export default class App extends React.Component {
    constructor(props) {
        super(props);

        this.CHAIN_ID = 'pulsar-2';
        this.ALERT_SHOW_TIME = 10000;

        this.CONTRACT_ID = 21033;
        this.CODE_HASH = '9c09c7924ad7b90719fedcb05bff2c1fd898f80a7216c00259558f1c4265387d';

        this.API_LCD = 'https://api.pulsar.scrttestnet.com';

        this.author = 'Tomáš Hladký';
        this.authorEmail = 'xhladk15@stud.fit.vutbr.cz';

        this.state = {
            walletConnected: WalletState.Connecting,
            secretjs: null,

            // Create
            formTitle: '',
            formCandidates: [],
            formVoters: [],
            formCloseTime: DateTime.now().startOf('day'),
            formCloseTimeSeconds: 43200,
            formSubmitLoading: false,
            createContractSuccess: false,
            createContractAddress: '',

            // Interact
            interactState: InteractState.Search,
            searchContractText: '',
            searchContractLoading: false,

            lastRefreshTime: null,
            smartContractName: '',
            smartContractCandidates: [],
            smartContractVotersCount: 0,
            smartContractEndTime: null,
            smartContractAlreadyVoted: false,
            smartContractResults: [],
        };

        this.toastAlertRef = React.createRef();
        this.toastTimeout = null;

        this.showAlert = this.showAlert.bind(this);
        this.hideAlert = this.hideAlert.bind(this);
        this.parseFormTime = this.parseFormTime.bind(this);
        this.searchSmartContract = this.searchSmartContract.bind(this);
        this.instantiateContract = this.instantiateContract.bind(this);
        this.sendVote = this.sendVote.bind(this);
    }

    async componentDidMount() {
        this.toastAlert = new Toast(this.toastAlertRef.current, {
            delay: this.ALERT_SHOW_TIME,
        });

        window.onload = async () => {
            await this.initWallet();
        };

        window.addEventListener('keplr_keystorechange', () => {
            console.log('Keplr wallet has changed');
            this.setState(
                {
                    walletConnected: WalletState.Connecting,
                },
                async () => {
                    await this.initWallet();

                    if (this.state.smartContractName !== '') {
                        await this.searchSmartContract();
                    }
                },
            );
        });
    }

    async initWallet() {
        if (!window.keplr || !window.getEnigmaUtils || !window.getOfflineSignerOnlyAmino) {
            console.log('Cannot connect to keplr');
            this.setState({
                walletConnected: WalletState.Error,
            });
        } else {
            await window.keplr.enable(this.CHAIN_ID);

            const keplrOfflineSigner = window.keplr.getOfflineSignerOnlyAmino(this.CHAIN_ID);
            const [{ address: myAddress }] = await keplrOfflineSigner.getAccounts();

            const secretjs = new SecretNetworkClient({
                url: this.API_LCD,
                chainId: this.CHAIN_ID,
                wallet: keplrOfflineSigner,
                walletAddress: myAddress,
                encryptionUtils: window.keplr.getEnigmaUtils(this.CHAIN_ID),
            });

            this.setState(
                {
                    walletConnected: WalletState.Connected,
                    secretjs: secretjs,
                },
                () => {},
            );

            console.log(secretjs.address);
        }
    }

    getWalletInfoText() {
        switch (this.state.walletConnected) {
            case WalletState.Connecting:
                return 'Connecting to wallet...';
            case WalletState.Connected:
                return 'Wallet connected';
            case WalletState.Error:
            default:
                return 'Error connecting wallet';
        }
    }

    getVotingWinner() {
        let winner = { name: '', votes: -1 };
        let sameValue = false;
        for (const result of this.state.smartContractResults) {
            if (result.votes > winner.votes) {
                winner = result;
                sameValue = false;
            } else if (result.votes === winner.votes) {
                sameValue = true;
            }
        }

        if (winner.votes === 0 || winner.votes === -1) {
            return 'No winner';
        } else if (sameValue) {
            return 'No winner, it is a tie';
        } else {
            return `Winner: ${this.state.smartContractCandidates.find((candidate) => candidate.id === winner.id).name}`;
        }
    }

    parseFormTime(value) {
        if (value.trim() === '') {
            return;
        } else {
            let seconds = 0;
            const time = value.split(':');

            seconds += parseInt(time[0] * 60 * 60);
            seconds += parseInt(time[1] * 60);

            this.setState({
                formCloseTimeSeconds: seconds,
            });
        }
    }

    async sendVote(candidateId) {
        try {
            const res = await this.state.secretjs.tx.compute.executeContract({
                sender: this.state.secretjs.address,
                contract_address: this.state.searchContractText,
                code_hash: this.CODE_HASH,
                gasLimit: 1_000_000,
                msg: {
                    submit_vote: {
                        candidate_id: candidateId,
                    },
                },
            });

            console.log(res);

            if (typeof res !== 'undefined' || (res !== null && res.code === 0)) {
                localStorage.setItem(`${this.state.secretjs.address}_${this.state.searchContractText}`, 'true');
                this.setState({
                    smartContractAlreadyVoted: true,
                });
            }
        } catch (e) {
            console.log(e);
            this.showAlert('Smart contract error', 'Invalid smart contract address or transimission error');
        }
    }

    async instantiateContract() {
        // Parse params
        const params = {
            name: this.state.formTitle,
            candidates: this.state.formCandidates.map((item, index) => (item = { id: index, name: item })),
            voters: this.state.formVoters,
            close_time: Math.ceil(
                this.state.formCloseTime.plus({ seconds: this.state.formCloseTimeSeconds }).toSeconds(),
            ),
        };

        console.log(params);
        try {
            const res = await this.state.secretjs.tx.compute.instantiateContract({
                sender: this.state.secretjs.address,
                code_id: this.CONTRACT_ID,
                code_hash: this.CODE_HASH,
                gasLimit: 2_000_000,
                init_msg: params,
                label: `${this.state.formTitle}_${new Date().toISOString()}`,
            });

            console.log(res);

            if (res.code === 0) {
                for (const log of res.arrayLog) {
                    if (log.type === 'instantiate' && log.key === 'contract_address') {
                        this.setState({
                            createContractSuccess: true,
                            createContractAddress: log.value,
                        });
                        break;
                    }
                }
            }
        } catch (e) {
            console.log(e);
            if (e instanceof SyntaxError) {
                this.showAlert('JSON parsing error', 'Invalid smart contract instantiation message');
            } else {
                this.showAlert('Smart contract error', 'Invalid smart contract address or transimission error');
            }
        }
    }

    async searchSmartContract() {
        this.setState(
            {
                searchContractLoading: true,
            },
            async () => {
                try {
                    const name = await this.state.secretjs.query.compute.queryContract({
                        contract_address: this.state.searchContractText,
                        code_hash: this.CODE_HASH,
                        query: { get_name: {} },
                    });

                    const candidateList = await this.state.secretjs.query.compute.queryContract({
                        contract_address: this.state.searchContractText,
                        code_hash: this.CODE_HASH,
                        query: { get_candidate_list: {} },
                    });

                    const votersCount = await this.state.secretjs.query.compute.queryContract({
                        contract_address: this.state.searchContractText,
                        code_hash: this.CODE_HASH,
                        query: { get_voters_count: {} },
                    });

                    const closeTime = await this.state.secretjs.query.compute.queryContract({
                        contract_address: this.state.searchContractText,
                        code_hash: this.CODE_HASH,
                        query: { get_close_time: {} },
                    });

                    const closeDateTime = DateTime.fromSeconds(closeTime);

                    console.log(name);
                    console.log(candidateList);
                    console.log(votersCount);
                    console.log(closeTime);

                    let results = [];

                    if (closeDateTime.diffNow().as('seconds') < 0) {
                        results = await this.state.secretjs.query.compute.queryContract({
                            contract_address: this.state.searchContractText,
                            code_hash: this.CODE_HASH,
                            query: { get_results: {} },
                        });

                        if (typeof results === 'string' && results.substring(0, 13) === 'Generic error') {
                            results = [];
                        }
                    }

                    // Check local storage if not voted
                    const alreadyVoted = localStorage.getItem(
                        `${this.state.secretjs.address}_${this.state.searchContractText}`,
                    );

                    this.setState({
                        interactState: InteractState.Interact,
                        smartContractName: name,
                        smartContractCandidates: candidateList,
                        smartContractVotersCount: votersCount,
                        smartContractEndTime: closeDateTime,
                        smartContractResults: results,
                        searchContractLoading: false,
                        smartContractAlreadyVoted: alreadyVoted !== null,
                        lastRefreshTime: DateTime.now(),
                    });
                } catch (e) {
                    console.log(e);
                    this.showAlert('Smart contract error', 'Invalid smart contract address or transimission error');
                    this.setState({
                        searchContractLoading: false,
                    });
                }
            },
        );
    }

    // Create E-voting section:
    renderSectionCreateEvoting() {
        return (
            <div className="container m-4">
                <div className="d-flex flex-row">
                    <div className="d-flex flex-column">
                        <label className={'input-label mb-1'}>E-voting smart contract title</label>
                        <input
                            className={'mb-4'}
                            type={'text'}
                            placeholder={'Title'}
                            value={this.state.formTitle}
                            onChange={(event) => {
                                this.setState({
                                    formTitle: event.target.value,
                                });
                            }}
                        ></input>
                        <label className={'input-label mb-1'}>Candidates</label>
                        <TagsInput
                            addOnBlur={true}
                            addKeys={[9, 13, 188]}
                            className={'react-tagsinput mb-4'}
                            onlyUnique={true}
                            value={this.state.formCandidates}
                            inputProps={{ placeholder: 'Add a candidate' }}
                            onChange={(tags) => {
                                this.setState({ formCandidates: tags });
                            }}
                        />
                        <label className={'input-label mb-1'}>Voters</label>
                        <TagsInput
                            addOnBlur={true}
                            addKeys={[9, 13, 32, 188]}
                            className={'react-tagsinput mb-4'}
                            onlyUnique={true}
                            value={this.state.formVoters}
                            inputProps={{ placeholder: 'Add a Secret address' }}
                            onChange={(tags) => {
                                this.setState({ formVoters: tags });
                            }}
                        />
                        <label className={'input-label mb-1'}>Close date (UTC)</label>
                        <DatePicker
                            className={'mb-4'}
                            selectedDate={this.state.formCloseTime.toJSDate()}
                            handleChange={(date) => this.setState({ formCloseTime: DateTime.fromJSDate(date) })}
                            placeholder={'Close time'}
                        />
                        <label className={'input-label mb-1'}>Close time (UTC)</label>
                        <input
                            className="time-picker-input mb-5"
                            type="time"
                            value={Duration.fromMillis(this.state.formCloseTimeSeconds * 1000).toFormat('hh:mm')}
                            onChange={(event) => this.parseFormTime(event.target.value)}
                        ></input>
                        <button
                            className={'primary-button search-button mb-4'}
                            onClick={this.instantiateContract}
                            disabled={this.state.searchContractLoading}
                        >
                            Create contract
                        </button>
                    </div>
                    <div className="mx-4 vr"></div>
                    <div className="d-flex flex-column">
                        {this.state.createContractSuccess ? (
                            <>
                                <p>Contract successfully created</p>
                                <div className="d-flex flex-row">
                                    <p className="me-2">Contract address:</p>
                                    <code>{this.state.createContractAddress}</code>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    // Interact E-voting section:
    renderSectionInteractEvoting() {
        return (
            <div className={'my-4'}>
                {this.state.interactState === InteractState.Search
                    ? this.renderSearchEvoting()
                    : this.state.interactState === InteractState.Interact
                    ? this.renderInteractEvoting()
                    : null}
            </div>
        );
    }

    renderSearchEvoting() {
        return (
            <div className="d-flex flex-column search-contract">
                <input
                    className={'mb-4'}
                    type={'text'}
                    placeholder={'E-voting contract address'}
                    value={this.state.searchContractText}
                    onChange={(event) => {
                        this.setState({
                            searchContractText: event.target.value,
                        });
                    }}
                ></input>
                <button
                    className={'primary-button search-button'}
                    onClick={this.searchSmartContract}
                    disabled={this.state.searchContractLoading}
                >
                    {this.state.searchContractLoading ? 'Loading...' : 'Search'}
                </button>
            </div>
        );
    }

    renderInteractEvoting() {
        const votingInProgress =
            this.state.smartContractEndTime.diffNow().as('seconds') > 0 || this.state.smartContractResults.length === 0;
        console.log(this.state.smartContractResults);
        return (
            <div className="container m-4">
                <div className="d-flex flex-row">
                    <h4>{this.state.smartContractName}</h4>
                    <a href="#" className="refresh-link ms-auto" onClick={this.searchSmartContract}>
                        Refresh
                        <img className="ms-1" src={RefreshIcon}></img>
                    </a>
                    <p className="ms-4">
                        Last refresh: {this.state.lastRefreshTime.toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS)}
                    </p>
                </div>
                <hr />
                <div className="d-flex flex-row">
                    <p className="me-2">State:</p>
                    <b>{votingInProgress ? 'In progress' : `Finished - ${this.getVotingWinner()}`}</b>
                </div>
                <div className="d-flex flex-row">
                    <p className="me-2">Finish time:</p>
                    <b>{this.state.smartContractEndTime.toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS)}</b>
                </div>
                <table></table>
                <div className="d-flex flex-row">
                    <p className="me-2">Eligible voters count:</p>
                    <b>{this.state.smartContractVotersCount}</b>
                </div>
                <table className="table table-dark">
                    <thead>
                        <tr>
                            <th scope="col">ID</th>
                            <th scope="col">Candidate</th>
                            {!votingInProgress ? <th scope="col">Earned votes</th> : <th scope="col">Vote</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {this.state.smartContractCandidates.map((candidate) => (
                            <tr key={candidate.id}>
                                <th scope="row">{candidate.id}</th>
                                <td>{candidate.name}</td>
                                {!votingInProgress ? (
                                    <td>
                                        {
                                            this.state.smartContractResults.find(
                                                (candidateResult) => candidateResult.id === candidate.id,
                                            ).votes
                                        }
                                    </td>
                                ) : (
                                    <td>
                                        <button
                                            className="primary-button"
                                            disabled={!votingInProgress || this.state.smartContractAlreadyVoted}
                                            onClick={() => this.sendVote(candidate.id)}
                                        >
                                            {!votingInProgress
                                                ? 'Voting finished'
                                                : this.state.smartContractAlreadyVoted
                                                ? 'Already voted'
                                                : 'Vote'}
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <a
                    className="return-link"
                    href="#"
                    onClick={() => {
                        this.setState({
                            interactState: InteractState.Search,
                            searchContractText: '',
                            searchContractLoading: false,

                            smartContractName: '',
                            smartContractCandidates: [],
                            smartContractVotersCount: 0,
                            smartContractEndTime: null,
                            smartContractAlreadyVoted: false,
                            smartContractResults: [],
                            lastRefreshTime: null,
                        });
                    }}
                >
                    Return
                </a>
            </div>
        );
    }

    renderInfo() {
        return (
            <div className="container m-4">
                <div className="d-flex flex-column">
                    <h5>Secret decentralized e-voting app</h5>
                    <hr />
                    <p>
                        This project was created as a part of the BDA (Blockchain and Decentralised Applicatons) course
                        at Brno University of Technology, 2023
                    </p>
                    <div className="d-flex flex-row">
                        <p className="me-2">Author:</p>
                        <a className="href" href={`mailto:${this.authorEmail}`}>
                            {this.author}
                        </a>
                    </div>
                    <hr />
                    {this.renderWalletInfo()}
                    <hr />
                    <p>Please note, that close time synchronization highly depends on block generation time. Execution transactions has been tested with 90,000+ gas.</p>
                </div>
            </div>
        );
    }

    renderWalletInfo() {
        if (this.state.walletConnected !== WalletState.Connected) {
            return null;
        } else {
            return (
                <>
                    <div className="d-flex flex-row">
                        <p className="me-2">Chain ID:</p>
                        <b>{this.CHAIN_ID}</b>
                    </div>
                    <div className="d-flex flex-row">
                        <p className="me-2">Contract ID:</p>
                        <code>{this.CONTRACT_ID}</code>
                    </div>
                    <div className="d-flex flex-row">
                        <p className="me-2">Contract code hash:</p>
                        <code>{this.CODE_HASH}</code>
                    </div>
                    <hr />
                    <div className="d-flex flex-row">
                        <p className="me-2">Connected secret wallet address:</p>
                        <code>{this.state.secretjs.address}</code>
                    </div>
                </>
            );
        }
    }

    showAlert(alertTitle = 'Oops, this should not happen', alertContent = 'Error while communicating with server.') {
        this.setState(
            {
                alertTitle: alertTitle,
                alertContent: alertContent,
            },
            () => {
                if (this.toastTimeout !== null) {
                    clearTimeout(this.toastTimeout);
                }
                this.toastAlert.show();
                this.toastTimeout = setTimeout(() => {
                    this.toastAlert.hide();
                }, this.ALERT_SHOW_TIME);
            },
        );
    }

    hideAlert() {
        clearTimeout(this.toastTimeout);
        this.toastTimeout = null;
        this.toastAlert.hide();
    }

    renderAlertToast() {
        return (
            <div className={'position-fixed top-0 end-0 p-3'} style={{ zIndex: 11 }}>
                <div ref={this.toastAlertRef} className={'toast hide'} role={'alert'}>
                    <div className={'toast-header'}>
                        <img className={'me-1'} src={ErrorIcon} alt={'error'} />
                        <strong className={'me-auto'}>{this.state.alertTitle}</strong>
                        <button type={'button'} className={'btn-close'} onClick={this.hideAlert}></button>
                    </div>
                    <div className={'toast-body'}>{this.state.alertContent}</div>
                </div>
            </div>
        );
    }

    render() {
        return (
            <>
                {this.renderAlertToast()}
                <header className={'navbar navbar-dark navbar-expand-md bg-dark title'}>
                    <div className={'container'}>
                        <a className={'navbar-brand d-flex flex-row'} href={'/'}>
                            <img src={Logo} alt={'logo'} width={40} />
                            <h3 className={'ms-3 mb-0 title'}>Secret E-voting DApp</h3>
                        </a>
                        <button
                            className={'navbar-toggler'}
                            type={'button'}
                            data-bs-toggle={'collapse'}
                            data-bs-target={'#navbarNav'}
                            aria-controls={'navbarNav'}
                            aria-expanded={'false'}
                            aria-label={'Toggle navigation'}
                        >
                            <span className="navbar-toggler-icon"></span>
                        </button>
                        <div className={'collapse navbar-collapse'} id={'navbarNav'}>
                            <ul className={'navbar-nav me-auto'}></ul>
                            <p className={'mb-0 ps-0'}>{this.getWalletInfoText()}</p>
                        </div>
                    </div>
                </header>
                <div className="container my-4">
                    <nav>
                        <div className="nav nav-tabs" id="nav-tab" role="tablist">
                            <button
                                className="nav-link active"
                                id="nav-join-tab"
                                data-bs-toggle="tab"
                                data-bs-target="#nav-join"
                                type="button"
                                role="tab"
                                aria-controls="nav-join"
                                aria-selected="true"
                            >
                                Interact with existing E-voting
                            </button>
                            <button
                                className="nav-link"
                                id="nav-create-tab"
                                data-bs-toggle="tab"
                                data-bs-target="#nav-create"
                                type="button"
                                role="tab"
                                aria-controls="nav-create"
                                aria-selected="false"
                            >
                                Create E-voting
                            </button>
                            <button
                                className="nav-link"
                                id="nav-info-tab"
                                data-bs-toggle="tab"
                                data-bs-target="#nav-info"
                                type="button"
                                role="tab"
                                aria-controls="nav-info"
                                aria-selected="false"
                            >
                                Info
                            </button>
                        </div>
                    </nav>
                    <div className="tab-content" id="nav-tabContent">
                        <div
                            className="tab-pane fade show active"
                            id="nav-join"
                            role="tabpanel"
                            aria-labelledby="nav-join-tab"
                        >
                            {this.renderSectionInteractEvoting()}
                        </div>
                        <div className="tab-pane fade" id="nav-create" role="tabpanel" aria-labelledby="nav-create-tab">
                            {this.renderSectionCreateEvoting()}
                        </div>
                        <div className="tab-pane fade" id="nav-info" role="tabpanel" aria-labelledby="nav-info-tab">
                            {this.renderInfo()}
                        </div>
                    </div>
                </div>
            </>
        );
    }
}
