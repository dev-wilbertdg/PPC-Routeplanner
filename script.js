function filterLocation() {
    const input = document.getElementById('fromLoc').value.toUpperCase();
    const resultDiv = document.getElementById('result');
    if (locations[input]) {
      resultDiv.innerHTML = `Location ${input}: ${locations[input]}`;
    } else {
      resultDiv.innerHTML = 'Location not found';
    }
}