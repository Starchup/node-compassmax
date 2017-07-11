function checkType(name, value, type) {
    if (getType(value) !== type) {
        throw new Error('argument \'' + name + '\' must be type ' + type);
    }
}

function getType(value) {
    var longType = Object.prototype.toString.call(value);
    return longType.slice(8, -1);
}

function forceToArray(value) {
    if (getType(value) !== 'Array') return [value];
    return value;
}

module.exports = {
    getType: getType,
    checkType: checkType,
    forceToArray: forceToArray,
};
