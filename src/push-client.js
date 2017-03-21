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
  console.log('[PUSH-CLIENT] Starting service with options', options);
  isStarted = true;
  Object.values(channels).map(c=>c.start(options));

  _options = options;
  return this;
}
export function stop() {
  channels.map(c=>c.stop());
  isStarted = false;
  return this;
}

export function messages(options) {
  console.log('[PUSH-CLIENT] Get messages...');
  let url = _options.serverUrl + _options.path + '?userId=' + _options.userId;

  if (options) {
    let {page, pageSize} = options;

    if (page != null && pageSize != null) {
      url += `&page=${page}&pageSize=${pageSize}`;
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
      console.error('[PUSH-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(result => {
    console.log('[PUSH-CLIENT] Get messages success. Got ' + result.messages.length + ' messages.');
    let displayMessages = result.messages;
    let unreadMessages = result.messages.filter(m => !m.isRead);
    if (filter === 'unread') {
      displayMessages = unreadMessages;
    }

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
export function unreadCount() {
  console.log('[PUSH-CLIENT] Get unread message count...');
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
      console.log('[PUSH-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(result=>{
    if (_unreadCount != result.count) {
      _unreadCount = result.count;
      emit('unreadChange', _unreadCount);
    }

    return result.count;
  });
}

export function read(sendId) {
  console.log(`[PUSH-CLIENT] Set message {sendId: ${sendId}} read...`);
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
      console.log('[PUSH-CLIENT] ' + err);
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
export function delay(sendId, schedule) {
  console.log(`[PUSH-CLIENT] Set message {sendId: ${sendId}} delay to ${schedule}...`);
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
      console.log('[PUSH-CLIENT] ' + err);
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

export function register(userId, deviceId, channel) {
  console.log('[PUSH-CLIENT] Register device. ', {userId, deviceId, channel});

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
      console.log('[PUSH-CLIENT] ' + err);
      throw Error(err)
    }

    return res.json();
  }).then(function(result) {
    return result;
  });
}