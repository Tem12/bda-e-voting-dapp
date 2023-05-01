import React from 'react';
import PropTypes from 'prop-types';
import ReactDatePicker from 'react-datepicker';

import 'react-datepicker/dist/react-datepicker.css';
import './DatePicker.scss';

export default class DatePicker extends React.Component {
    constructor(props) {
        super(props);

        this.datePickerRef = React.createRef();
        this.handleChange = this.handleChange.bind(this);
    }

    componentDidMount() {
        // Turn off spellcheck on react-datepicker input container
        this.datePickerRef.current.input.spellcheck = false;
    }

    handleChange(date) {
        this.props.handleChange(date);
    }

    render() {
        return (
            <div className={this.props.className}>
                <ReactDatePicker
                    ref={this.datePickerRef}
                    selected={this.props.selectedDate}
                    onChange={this.handleChange}
                    calendarStartDay={1}
                    placeholderText={this.props.placeholder}
                />
            </div>
        );
    }
}

DatePicker.propTypes = {
    className: PropTypes.string,
    handleChange: PropTypes.func,
    selectedDate: PropTypes.object,
    placeholder: PropTypes.string,
};
