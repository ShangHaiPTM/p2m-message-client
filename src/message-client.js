/**
 * Created by colinhan on 24/02/2017.
 */

let connections = {};
let channels = {};
let isStarted = false;
let dispatchedMessage = {};
let _options;
let _unreadCount;

let events = {};

// events:
//  connect(connectedChannelCount, newChannelId), Fired when new channel connected to server.
//  disconnect(connectedChannelCount, disconnectChannelId), Fired when a channel is disconnected from server.
//  message(message, channelId), Fired when a new message coming. Only first event will fired even if the message is sent from multiple channel.
//  unreadChange(unreadCount), Fired if count of unread messages is changed.
//  openMessage(message, channelId), Fired when user open the message through the way provider by channel, E.g. JPush provider this function when user press message on notification panel.
export function on(event, callback) {
  let list = events[event] = events[event] || [];
  list.push({cb: callback});

  if (event === 'connect') {
    for (let channelId in connections) {
      callback(Object.keys(connections).length, channelId);
    }
  }
  return this;
}
export function off(event, callback) {
  let list = events[event];
  if (list && list.length) {
    events[event] = list.filter(e=>e !== callback);
  }
}
function emit(event, ...params) {
  let list = events[event];
  if (list) {
    list.map(e=>e.cb.apply(null, params));
  }
}

export function use(channel) {
  if (channels[channel.channelId]) {
    throw Error('多个通道不能使用相同的通道id。');
  }

  channels[channel.channelId] = channel;

  channel.on('connect', onChannelConnect)
      .on('message', onChannelMessage)
      .on('openMessage', onChannelOpenMessage)
      .on('disconnect', onChannelDisconnect);

  if (isStarted) {
    channel.start(_options);
  }

  return this;
}

function onChannelConnect(channel) {
  let channelId = channel.channelId;
  connections[channelId] = channel;
  let connectionCount = Object.keys(connections).length;

  emit('connect', connectionCount, channelId);
}
function onChannelDisconnect(channel) {
  let channelId = channel.channelId;
  delete connections[channelId];
  delete channels[channelId];
  let connectionCount = Object.keys(connections).length;

  emit('disconnect', connectionCount, channelId);
}
function onChannelMessage(message, channel) {
  let channelId = channel.channelId;
  let sendId = message.sendId;

  if (dispatchedMessage[sendId]) return;
  dispatchedMessage[sendId] = true;

  emit('message', message, channelId);
  emit('unreadChange', _unreadCount++);
}
function onChannelOpenMessage(message, channel) {
  let channelId = channel.channelId;

  emit('openMessage', message, channelId);
}

export function start(options) {
  console.log('[MSG-CLIENT] Starting service with options', options);
  isStarted = true;
  Object.values(channels).map(c=>c.start(options));

  _options = options;
  return this;
}
export function stop(options) {
  Object.values(channels).map(c=>c.stop(options));
  isStarted = false;
  return this;
}

export function messages(options) {
  console.log('[MSG-CLIENT] Get messages...');
  //noinspection JSUnresolvedVariable
  let url = _options.serverUrl + _options.path + '?userId=' + _options.userId;

  if (options) {
    let {page, pageSize} = options;

    //noinspection EqualityComparisonWithCoercionJS
    if (page != null) {// && pageSize != null) {
      url += '&page=' + page;// + '&pageSize=' + pageSize;
    }
  }

  let filter;
  if (options) {
    filter = options.filter;
    if (filter) {
      url += `&filter=${filter}`
    }
  }

  return fetch(url, {
    method: 'get',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  }).then(res => {
    if (!res.ok) {
      let err = `Update messages failed with err: ${res.status} - ${res.statusText}`;
      console.error('[MSG-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(result => {
    console.log('[MSG-CLIENT] Get messages success. Got ' + result.messages.length + ' messages.');
    let displayMessages = result.messages;
    //noinspection JSUnresolvedVariable
    let unreadMessages = result.messages.filter(m => !m.isRead);
    if (filter === 'unread') {
      displayMessages = unreadMessages;
    }

    //noinspection EqualityComparisonWithCoercionJS
    if (_unreadCount != result.count) {
      _unreadCount = result.count;
      emit('unreadChange', _unreadCount);
    }

    return {
      messages: result.messages,
      displayMessages,
      unreadCount: result.count,
    };
  });
}
//noinspection JSUnusedGlobalSymbols
export function unreadCount() {
  console.log('[MSG-CLIENT] Get unread message count...');
  //noinspection JSUnresolvedVariable
  let url = _options.serverUrl + _options.path + '/unread-count?userId=' + _options.userId;

  return fetch(url, {
    method: 'get',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  }).then(res => {
    if (!res.ok) {
      let err = `Get unread message count failed with err: ${res.status} - ${res.statusText}`;
      console.log('[MSG-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(result=>{
    if (_unreadCount !== result.count) {
      _unreadCount = result.count;
      emit('unreadChange', _unreadCount);
    }

    return result.count;
  });
}

//noinspection JSUnusedGlobalSymbols
export function delivered(pushId) {
  console.log(`[MSG-CLIENT] Set message {pushId: ${pushId}} delivered...`);
  //noinspection JSUnresolvedVariable
  let url = _options.serverUrl + _options.path + '/delivered';
  fetch(url, {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pushId: pushId
    }),
    credentials: 'include',
  }).then(res => {
    if (!res.ok) {
      let err = `Set message delivered failed with err: ${res.status} - ${res.statusText}`;
      console.log('[MSG-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(function(result) {
    if(result.success) {
      console.log(`[MSG-CLIENT] Set message delivered failed with err: ${result.status} - ${result.statusText}`);
    }
    return result;
  });
}
//noinspection JSUnusedGlobalSymbols
export function read(sendId) {
  console.log(`[MSG-CLIENT] Set message {sendId: ${sendId}} read...`);
  //noinspection JSUnresolvedVariable
  let url = _options.serverUrl + _options.path + '/read';

  return fetch(url, {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sendId
    }),
    credentials: 'include',
  }).then(res => {
    if (!res.ok) {
      let err = `Set message read failed with err: ${res.status} - ${res.statusText}`;
      console.log('[MSG-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(function(result) {
    if(result.success) {
      _unreadCount--;
      emit('unreadChange', _unreadCount);
    }
    return result;
  });
}
//noinspection JSUnusedGlobalSymbols
export function delay(sendId, schedule) {
  console.log(`[MSG-CLIENT] Set message {sendId: ${sendId}} delay to ${schedule}...`);
  //noinspection JSUnresolvedVariable
  let url = _options.serverUrl + _options.path + '/delay';

  return fetch(url, {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sendId
    }),
    credentials: 'include',
  }).then(res => {
    if (!res.ok) {
      let err = `Set message read failed with err: ${res.status} - ${res.statusText}`;
      console.log('[MSG-CLIENT] ' + err);
      return {success: false, error: err};
    }

    return res.json();
  }).then(result=> {
    if (result.success) {
      _unreadCount--;
      emit('unreadChange', _unreadCount);
    }

    return result;
  });
}

export function unRegister(userId, deviceId, channel) {
  console.log('[MSG-CLIENT] unRegister device. ', { userId: userId, deviceId: deviceId, channel: channel });
  var url = _options.serverUrl + _options.path + '/unregister';
  return fetch(url, {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: userId, deviceId: deviceId, channel: channel
    }),
    credentials: 'include'
  }).then(function (res) {
    if (!res.ok) {
      var err = 'unRegister device failed with err: ' + res.status + ' - ' + res.statusText;
      console.log('[MSG-CLIENT] ' + err);
      throw Error(err);
    }

    return res.json();
  }).then(function (result) {
    return result;
  });
}

export function register(userId, deviceId, channel) {
  console.log('[MSG-CLIENT] Register device. ', {userId, deviceId, channel});

  //noinspection JSUnresolvedVariable
  let url = _options.serverUrl + _options.path + '/register';

  return fetch(url, {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId, deviceId, channel
    }),
    credentials: 'include',
  }).then(res => {
    if (!res.ok) {
      let err = `Register device failed with err: ${res.status} - ${res.statusText}`;
      console.log('[MSG-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(function(result) {
    return result;
  });
}