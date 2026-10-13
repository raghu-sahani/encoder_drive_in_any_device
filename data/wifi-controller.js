/* Mobile ESP32 Wi-Fi access point controller; USB controller remains unchanged on desktop. */
'use strict';
window.EncoderWifiController = (() => {
  function create(game, $) {
    let connected=false, alive=false, armed=false, seen=false, lastValid=0;
    let inFlight=null, timer=null, session=0, firstConnection=true;
    const MAX_STALE_MS=1200, POLL_DELAY_MS=45;
    function disarm() {armed=false;game.input.accel=0;game.input.brake=0;game.input.releaseRequired=connected}
    game.setHardwareReset(disarm);
    function ui() {
      const label=$('connection');
      label.classList.toggle('live',connected&&alive);
      label.textContent=!connected?'Touch mode':!alive?(seen?'ESP32 Wi-Fi · signal lost':'ESP32 Wi-Fi · connecting'):armed?'ESP32 Wi-Fi · ready':'ESP32 Wi-Fi · release buttons';
      $('connect').textContent=connected?'Disconnect Wi-Fi':'Connect Wi-Fi';
    }
    function stop(message) {
      ++session;
      connected=false;alive=false;armed=false;seen=false;
      if(timer!==null){clearTimeout(timer);timer=null}
      if(inFlight){inFlight.abort();inFlight=null}
      game.safeStop();game.input.serial=false;game.input.blocked=false;game.input.steer=0;game.input.releaseRequired=false;
      if(message)game.message(message);
      ui();
    }
    function lostSignal() {
      if(!alive)return;
      alive=false;armed=false;
      game.safeStop();game.input.steer=0;game.input.blocked=true;
      game.message('Wi-Fi control signal lost. The car has stopped. Stay connected to ROBO-Drive-ESP32.');
      ui();
    }
    function snapshot(pkt) {
      if(!Number.isInteger(pkt.steer)||pkt.steer < -100||pkt.steer > 100||![0,1].includes(pkt.accel)||![0,1].includes(pkt.brake))throw new Error('Invalid ESP32 controller packet');
      const recovered=!alive, first=!seen;
      if(recovered){game.safeStop();armed=false}
      seen=true;alive=true;lastValid=performance.now();
      game.input.serial=true;game.input.blocked=false;
      game.input.steer=pkt.steer;
      // Re-arm only after both physical buttons are released. No runaway acceleration on reconnect.
      if(!armed&&pkt.accel===0&&pkt.brake===0&&!game.state.paused&&!game.state.crashed)armed=true;
      game.input.accel=armed?pkt.accel:0;
      game.input.brake=armed?pkt.brake:0;
      game.input.releaseRequired=!armed;
      if(first||recovered)game.message('ESP32 Wi-Fi connected. Release both buttons, center steering, then accelerate.');
      ui();
    }
    async function poll(mySession) {
      if(!connected||mySession!==session)return;
      const abort=new AbortController();inFlight=abort;
      const timeout=setTimeout(()=>abort.abort(),800);
      try{
        const res=await fetch('/api/controls?t='+Date.now(),{cache:'no-store',signal:abort.signal});
        if(!res.ok)throw new Error('Controller HTTP '+res.status);
        const pkt=await res.json();
        if(!connected||mySession!==session)return;
        snapshot(pkt);
      } catch(error) {
        if(connected&&mySession===session&&performance.now()-lastValid>MAX_STALE_MS)lostSignal();
      } finally {
        clearTimeout(timeout);
        if(inFlight===abort)inFlight=null;
        if(connected&&mySession===session)timer=setTimeout(()=>poll(mySession),POLL_DELAY_MS);
      }
    }
    function connect(){
      if(connected){stop('Wi-Fi hardware disconnected. Touch driving controls are available.');return}
      connected=true;alive=false;armed=false;seen=false;firstConnection=false;lastValid=performance.now();
      game.safeStop();game.input.serial=true;game.input.blocked=true;
      game.message('Connecting to ESP32 Wi-Fi controls…');ui();
      poll(++session);
    }
    $('connect').addEventListener('click',connect);
    // Loaded from the ESP32 itself: start hardware control automatically.
    connect();
    return {connect,disconnect:()=>stop(),get connected(){return connected},get alive(){return alive}};
  }
  return {create};
})();
