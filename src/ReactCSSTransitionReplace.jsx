/**
 * Adapted from ReactCSSTransitionGroup.js by Facebook
 *
 * @providesModule ReactCSSTransitionReplace
 */

import React from 'react'
import { findDOMNode } from 'react-dom'
import PropTypes from 'prop-types'
import chain from 'chain-function'
import warning from 'warning'

import raf from 'dom-helpers/util/requestAnimationFrame'
import { clearSelection } from './utils/dom-helpers'

import ReactCSSTransitionReplaceChild from './ReactCSSTransitionReplaceChild'
import { transitionTimeout } from 'react-transition-group/utils/PropTypes'
import { nameShape } from './utils/PropTypes'

const reactCSSTransitionReplaceChild = React.createFactory(ReactCSSTransitionReplaceChild)


export default class ReactCSSTransitionReplace extends React.Component {

  static displayName = 'ReactCSSTransitionReplace'

  static propTypes = {
    transitionName: nameShape.isRequired,

    transitionAppear: PropTypes.bool,
    transitionEnter: PropTypes.bool,
    transitionLeave: PropTypes.bool,
    transitionAppearTimeout: transitionTimeout('Appear'),
    transitionEnterTimeout: transitionTimeout('Enter'),
    transitionLeaveTimeout: transitionTimeout('Leave'),
    overflowHidden: PropTypes.bool,
    changeWidth: PropTypes.bool,
    notifyLeaving: PropTypes.bool,
  }

  static defaultProps = {
    transitionAppear: false,
    transitionEnter: true,
    transitionLeave: true,
    overflowHidden: true,
    changeWidth: false,
    notifyLeaving: false,
    component: 'div',
    childComponent: 'span',
  }

  constructor(props, context) {
    super(props, context)

    this.childRefs = Object.create(null)

    this.state = {
      currentKey: '1',
      currentChild: this.props.children ? React.Children.only(this.props.children) : undefined,
      prevChildren: {},
      height: null,
      width: null,
    }
  }

  componentWillMount() {
    this.shouldEnterCurrent = false
    this.keysToLeave = []
    this.transitioningKeys = {}
  }

  componentDidMount() {
    if (this.props.transitionAppear && this.state.currentChild) {
      this.performAppear(this.state.currentKey)
    }
  }

  componentWillUnmount() {
    this.unmounted = true
  }

  componentWillReceiveProps(nextProps) {
    const nextChild = nextProps.children ? React.Children.only(nextProps.children) : undefined
    const {currentChild} = this.state

    if ((!currentChild && !nextChild) || (currentChild && nextChild && currentChild.key === nextChild.key)) {
      return
    }

    const {currentKey, prevChildren} = this.state

    const nextState = {
      currentKey: String(Number(currentKey) + 1),
      currentChild: nextChild,
      height: 0,
      width: this.props.changeWidth ? 0 : null,
    }

    if (nextChild) {
      this.shouldEnterCurrent = true
    }

    if (currentChild) {
      nextState.height = findDOMNode(this.childRefs[currentKey]).offsetHeight
      nextState.width = this.props.changeWidth ? findDOMNode(this.childRefs[currentKey]).offsetWidth : null
      nextState.prevChildren = {
        ...prevChildren,
        [currentKey]: currentChild,
      }
      if (!this.transitioningKeys[currentKey]) {
        this.keysToLeave.push(currentKey)
      }
    }

    this.setState(nextState)
  }

  componentDidUpdate() {
    if (this.shouldEnterCurrent) {
      this.shouldEnterCurrent = false
      this.performEnter(this.state.currentKey)
    }

    const keysToLeave = this.keysToLeave
    this.keysToLeave = []
    keysToLeave.forEach(this.performLeave)

    // When the enter completes and the component switches to relative positioning the
    // child often gets selected after multiple clicks (at least in Chrome). To compensate
    // the current selection is cleared whenever the component updates.
    clearSelection()
  }

  performAppear(key) {
    this.transitioningKeys[key] = true
    this.childRefs[key].componentWillAppear(this.handleDoneAppearing.bind(this, key))
  }

  handleDoneAppearing = (key) => {
    delete this.transitioningKeys[key]
    if (key !== this.state.currentKey) {
      // This child was removed before it had fully appeared. Remove it.
      this.performLeave(key)
    }
  }

  performEnter(key) {
    this.transitioningKeys[key] = true
    this.childRefs[key].componentWillEnter(this.handleDoneEntering.bind(this, key))
    this.enqueueHeightTransition()
  }

  handleDoneEntering(key) {
    delete this.transitioningKeys[key]
    if (key === this.state.currentKey) {
      // The current child has finished entering so the height transition is also cleared.
      this.setState({height: null})
    } else {
      // This child was removed before it had fully appeared. Remove it.
      this.performLeave(key)
    }
  }

  performLeave = (key) => {
    this.transitioningKeys[key] = true
    this.childRefs[key].componentWillLeave(this.handleDoneLeaving.bind(this, key))
    if (!this.state.currentChild) {
      // The enter transition dominates, but if there is no
      // entering component the height is set to zero.
      this.enqueueHeightTransition()
    }
  }

  handleDoneLeaving(key) {
    delete this.transitioningKeys[key]

    const nextState = {prevChildren: {...this.state.prevChildren}}
    delete nextState.prevChildren[key]
    delete this.childRefs[key]

    if (!this.state.currentChild) {
      nextState.height = null
    }

    this.setState(nextState)
  }

  enqueueHeightTransition() {
    if (!this.rafHandle) {
      this.rafHandle = raf(this.performHeightTransition)
    }
  }

  performHeightTransition = () => {
    if (!this.unmounted) {
      const {state} = this
      this.setState({
        height: state.currentChild ? findDOMNode(this.childRefs[state.currentKey]).offsetHeight : 0,
        width: this.props.changeWidth
          ? (state.currentChild ? findDOMNode(this.childRefs[state.currentKey]).offsetWidth : 0)
          : null,
      })
    }
    this.rafHandle = null
  }

  wrapChild(child, moreProps) {
    let transitionName = this.props.transitionName

    if (typeof transitionName === 'object' && transitionName !== null) {
      transitionName = {...transitionName}
      delete transitionName.height
    }

    // We need to provide this childFactory so that
    // ReactCSSTransitionReplaceChild can receive updates to name,
    // enter, and leave while it is leaving.
    return reactCSSTransitionReplaceChild({
      name: transitionName,
      appear: this.props.transitionAppear,
      enter: this.props.transitionEnter,
      leave: this.props.transitionLeave,
      appearTimeout: this.props.transitionAppearTimeout,
      enterTimeout: this.props.transitionEnterTimeout,
      leaveTimeout: this.props.transitionLeaveTimeout,
      ...moreProps,
    }, child)
  }

  storeChildRef(child, key) {
    const isCallbackRef = typeof child.ref !== 'string'
    warning(isCallbackRef,
      'string refs are not supported on children of ReactCSSTransitionReplace and will be ignored. ' +
      'Please use a callback ref instead: https://facebook.github.io/react/docs/refs-and-the-dom.html#the-ref-callback-attribute')

    return chain(
      isCallbackRef ? child.ref : null,
      (r) => {this.childRefs[key] = r}
    )
  }

  render() {
    const {currentKey, currentChild, prevChildren, height, width} = this.state
    const childrenToRender = []

    const {
      overflowHidden, transitionName, component, childComponent, notifyLeaving,
      transitionAppear, transitionEnter, transitionLeave, changeWidth,
      transitionAppearTimeout, transitionEnterTimeout, transitionLeaveTimeout,
      ...containerProps
    } = this.props

    // In edge there is a glitch as the container switches from not positioned
    // to a positioned element at the start of a transition which is solved
    // by applying the position and overflow style rules at all times.
    containerProps.style = {
      ...containerProps.style,
      position: 'relative',
    }
    if (overflowHidden) {
      containerProps.style.overflow = 'hidden'
    }

    if (height !== null) {
      const heightClassName = typeof transitionName === 'string'
        ? `${transitionName}-height`
        : (transitionName && transitionName.height) || ''

      containerProps.className = `${containerProps.className || ''} ${heightClassName}`
      containerProps.style.height = height
    }

    if (width !== null) {
      containerProps.style.width = width
    }

    const positionAbsolute = {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }

    Object.keys(prevChildren).forEach(key => {
      const child = prevChildren[key]
      childrenToRender.push(
        React.createElement(childComponent,
          {key, style: positionAbsolute},
          this.wrapChild(
            notifyLeaving && typeof child.type !== 'string'
              ? React.cloneElement(child, {isLeaving: true})
              : child,
            {ref: this.storeChildRef(child, key)}
          )
        )
      )
    })

    if (currentChild) {
      childrenToRender.push(
        React.createElement(childComponent,
          {
            key: currentKey,
            // Positioning must always be specified to keep the
            // current child on top of the leaving children
            style: this.transitioningKeys[currentKey] ? positionAbsolute : {position: 'relative'},
          },
          this.wrapChild(
            currentChild,
            {ref: this.storeChildRef(currentChild, currentKey)}
          )
        )
      )
    }

    return React.createElement(component, containerProps, childrenToRender)
  }
}
