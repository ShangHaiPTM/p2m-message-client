/**
 * Created by colinhan on 21/03/2017.
 */

const {assert} = require('chai');

describe('load es6 module', ()=> {
  const client = require('../build/main/message-client');
  it('should has start() method', ()=> {
    assert.typeOf(client.start, 'function');
  });
  it('should has stop() method', ()=> {
    assert.typeOf(client.stop, 'function');
  });
});
